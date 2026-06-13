import type { Core } from '@strapi/strapi';
import { SERVER_BUILD_MARKER } from './buildVersion';
import {
  AUDIO_MODES,
  FFMPEG_PRESETS,
  PLUGIN_ID,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  codecForFormat,
  formatForCodec,
  isVideoMime,
  type OptimizationChoice,
  type OptimizationSettings,
} from './constants';
import { uploadContext } from './utils/request-context';
import {
  clearFallbackUploadPreferences,
  clearUploadBatchPreferences,
  consumeUploadPreference,
  createUploadContext,
  isUploadRoute,
  optimizerUploadContext,
  parseUploadPreferences,
  registerUploadBatchPreferences,
  resolveUploadBatchPreference,
  setFallbackUploadPreferences,
  stashUploadPreference,
  takePendingPreference,
} from './utils/upload-preferences-context';

const isValidChoice = (choice: unknown): choice is OptimizationChoice =>
  typeof choice === 'string' && ['original', 'global', 'custom'].includes(choice);

const isValidFormat = (format: unknown): format is OptimizationSettings['defaultFormat'] =>
  typeof format === 'string' && VIDEO_FORMATS.includes(format as OptimizationSettings['defaultFormat']);

const isValidCodec = (codec: unknown): codec is OptimizationSettings['videoCodec'] =>
  typeof codec === 'string' && VIDEO_CODECS.includes(codec as OptimizationSettings['videoCodec']);

const isValidAudioMode = (mode: unknown): mode is OptimizationSettings['audioMode'] =>
  typeof mode === 'string' && AUDIO_MODES.includes(mode as OptimizationSettings['audioMode']);

const isValidPreset = (preset: unknown): preset is OptimizationSettings['preset'] =>
  typeof preset === 'string' && FFMPEG_PRESETS.includes(preset as OptimizationSettings['preset']);

const normalizeCustomSettings = (
  custom: unknown,
  global: OptimizationSettings
): OptimizationSettings | undefined => {
  if (!custom || typeof custom !== 'object') {
    return undefined;
  }

  const value = custom as Partial<OptimizationSettings>;

  if (!isValidFormat(value.defaultFormat) && !isValidCodec(value.videoCodec)) {
    return undefined;
  }

  const defaultFormat = isValidFormat(value.defaultFormat)
    ? value.defaultFormat
    : isValidCodec(value.videoCodec)
      ? formatForCodec(value.videoCodec)
      : global.defaultFormat;

  return {
    defaultFormat,
    videoCodec: isValidCodec(value.videoCodec) ? value.videoCodec : codecForFormat(defaultFormat),
    crf: typeof value.crf === 'number' ? value.crf : Number(value.crf ?? global.crf),
    preset: isValidPreset(value.preset) ? value.preset : global.preset,
    maxWidth:
      typeof value.maxWidth === 'number' && value.maxWidth >= 1
        ? value.maxWidth
        : global.maxWidth,
    maxHeight:
      typeof value.maxHeight === 'number' && value.maxHeight >= 1
        ? value.maxHeight
        : global.maxHeight,
    audioMode: isValidAudioMode(value.audioMode) ? value.audioMode : global.audioMode,
    audioBitrate:
      typeof value.audioBitrate === 'string' ? value.audioBitrate : String(value.audioBitrate ?? global.audioBitrate),
  };
};

const configToSettings = (config: {
  defaultFormat: OptimizationSettings['defaultFormat'];
  videoCodec: OptimizationSettings['videoCodec'];
  crf: number;
  preset: OptimizationSettings['preset'];
  maxWidth: number;
  maxHeight: number;
  audioMode: OptimizationSettings['audioMode'];
  audioBitrate: string;
}): OptimizationSettings => ({
  defaultFormat: config.defaultFormat,
  videoCodec: config.videoCodec,
  crf: config.crf,
  preset: config.preset,
  maxWidth: config.maxWidth,
  maxHeight: config.maxHeight,
  audioMode: config.audioMode,
  audioBitrate: config.audioBitrate,
});

const runWithUser = <T>(userId: number | undefined, fn: () => Promise<T>) => {
  if (userId === undefined) {
    return fn();
  }
  return uploadContext.run({ userId }, fn);
};

const applyPreferenceToEntity = (
  entity: Record<string, unknown>,
  fileInfo: Record<string, unknown>,
  mime: string,
  globalDefaults: OptimizationSettings
) => {
  if (!isVideoMime(mime)) {
    const batchPreference = resolveUploadBatchPreference(
      String(entity.name ?? fileInfo.name ?? ''),
      typeof fileInfo.optimizerAssetId === 'string' ? fileInfo.optimizerAssetId : undefined
    );

    if (!batchPreference) {
      return;
    }
  }

  const fileName = String(entity.name ?? fileInfo.name ?? '');
  const assetId =
    typeof fileInfo.optimizerAssetId === 'string' ? fileInfo.optimizerAssetId : undefined;

  const preference = consumeUploadPreference(fileName, assetId);

  const applyPreference = (choice: OptimizationChoice, custom?: unknown) => {
    entity.optimizationChoice = choice;

    const normalizedCustom =
      choice === 'custom' ? normalizeCustomSettings(custom, globalDefaults) : undefined;

    if (normalizedCustom) {
      entity.optimizationCustom = normalizedCustom;
    } else {
      delete entity.optimizationCustom;
    }

    if (assetId) {
      entity.optimizerAssetId = assetId;
    }

    stashUploadPreference(fileName, assetId, { choice, custom: normalizedCustom });
  };

  if (preference) {
    applyPreference(preference.choice, preference.custom);
    return;
  }

  if (fileInfo.optimizationChoice && isValidChoice(fileInfo.optimizationChoice)) {
    applyPreference(fileInfo.optimizationChoice, fileInfo.optimizationCustom);
  }
};

const enqueueVideoJobs = async (
  strapi: Core.Strapi,
  files: Array<Record<string, unknown>>,
  globalDefaults: OptimizationSettings
) => {
  const preferenceService = strapi.plugin(PLUGIN_ID).service('preference');
  const jobQueue = strapi.plugin(PLUGIN_ID).service('job-queue');

  try {
    for (const file of files) {
      if (!isVideoMime(file.mime)) {
        continue;
      }

      const fileName = String(file.name ?? '');
      const assetId =
        typeof file.optimizerAssetId === 'string' ? file.optimizerAssetId : undefined;

      const batchPreference = resolveUploadBatchPreference(fileName, assetId);
      const pending = takePendingPreference(fileName, assetId);
      const optimizationChoice =
        batchPreference?.choice ??
        pending?.choice ??
        (isValidChoice(file.optimizationChoice) ? file.optimizationChoice : undefined);
      const optimizationCustom =
        (batchPreference?.choice === 'custom'
          ? normalizeCustomSettings(batchPreference.custom, globalDefaults)
          : undefined) ??
        pending?.custom ??
        (file.optimizationCustom as Partial<OptimizationSettings> | undefined);

      const resolved = await preferenceService.resolveOptimization({
        optimizationChoice,
        optimizationCustom,
        mime: file.mime as string,
      });

      if (resolved.skip || !resolved.settings || !file.id) {
        strapi.log.debug(
          `[video-optimizer] Skipping file ${file.id} (${fileName}): choice=${optimizationChoice ?? 'default'}, skip=${resolved.skip}`
        );
        continue;
      }

      strapi.log.info(
        `[video-optimizer] Queueing optimization for file ${file.id} (${fileName}) choice=${optimizationChoice ?? 'default'} → ${resolved.settings.defaultFormat}`
      );

      await jobQueue.enqueue({
        fileId: Number(file.id),
        settings: resolved.settings,
        choice: optimizationChoice,
      });
    }
  } finally {
    clearUploadBatchPreferences();
  }
};

const wrapUploadController = (
  strapi: Core.Strapi,
  handler: (ctx: { request: { body?: Record<string, unknown> } }) => Promise<unknown>
) => {
  return async (ctx: { request: { body?: Record<string, unknown> } }) => {
    const preferences = parseUploadPreferences(ctx.request.body);

    if (preferences.length === 0) {
      return handler(ctx);
    }

    registerUploadBatchPreferences(preferences);

    strapi.log.info(
      `[video-optimizer] Controller preferences (${preferences.length}, ${SERVER_BUILD_MARKER}): ${preferences
        .map((entry) => {
          const format =
            entry.preference.choice === 'custom'
              ? entry.preference.custom?.defaultFormat ?? '?'
              : entry.preference.choice;
          return `${entry.fileName}=${format}`;
        })
        .join(', ')}`
    );

    return optimizerUploadContext.run(createUploadContext(preferences), () => handler(ctx));
  };
};

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  const uploadService = strapi.plugin('upload').service('upload');
  const globalDefaults = configToSettings(strapi.plugin(PLUGIN_ID).config as ReturnType<
    typeof import('./config').default.default
  >);

  strapi.log.info(`[video-optimizer] Server bootstrap loaded (${SERVER_BUILD_MARKER})`);

  const adminUploadController = strapi.plugin('upload').controllers['admin-upload'] as
    | Record<string, (ctx: { request: { body?: Record<string, unknown> } }) => Promise<unknown>>
    | undefined;

  if (adminUploadController?.uploadFiles) {
    const originalUploadFiles = adminUploadController.uploadFiles.bind(adminUploadController);
    adminUploadController.uploadFiles = wrapUploadController(strapi, originalUploadFiles);
  }

  if (adminUploadController?.unstable_uploadFile) {
    const originalUnstableUpload = adminUploadController.unstable_uploadFile.bind(adminUploadController);
    adminUploadController.unstable_uploadFile = wrapUploadController(strapi, originalUnstableUpload);
  }

  strapi.server.use(async (ctx, next) => {
    if (!isUploadRoute(ctx.method, ctx.path)) {
      return next();
    }

    const preferences = parseUploadPreferences(ctx.request.body as Record<string, unknown>);

    if (preferences.length === 0) {
      return next();
    }

    registerUploadBatchPreferences(preferences);

    strapi.log.debug(
      `[video-optimizer] Upload preferences received (${preferences.length} file(s)) on ${ctx.path}: ${preferences
        .map((entry) => {
          const format =
            entry.preference.choice === 'custom'
              ? entry.preference.custom?.defaultFormat ?? '?'
              : entry.preference.choice;
          return `${entry.fileName}=${format}`;
        })
        .join(', ')}`
    );

    setFallbackUploadPreferences(preferences);

    try {
      return await optimizerUploadContext.run(createUploadContext(preferences), () => next());
    } finally {
      clearFallbackUploadPreferences();
    }
  });

  const originalFormatFileInfo = uploadService.formatFileInfo.bind(uploadService);
  uploadService.formatFileInfo = async (
    fileProps: { filename: string; type: string; size: number },
    fileInfo: Record<string, unknown> = {},
    metas: Record<string, unknown> = {}
  ) => {
    const entity = await originalFormatFileInfo(fileProps, fileInfo, metas);
    applyPreferenceToEntity(entity as Record<string, unknown>, fileInfo, fileProps.type, globalDefaults);
    return entity;
  };

  const originalUpload = uploadService.upload.bind(uploadService);
  uploadService.upload = async (args, opts) => {
    const result = await runWithUser(opts?.user?.id, () => originalUpload(args, opts));
    const files = Array.isArray(result) ? result : [result];

    if (files.length) {
      setImmediate(() => {
        void enqueueVideoJobs(strapi, files as Array<Record<string, unknown>>, globalDefaults).catch(
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            strapi.log.error(`[video-optimizer] Failed to enqueue upload jobs: ${message}`);
          }
        );
      });
    }

    return result;
  };

  const originalReplace = uploadService.replace.bind(uploadService);
  uploadService.replace = async (id, args, opts) => {
    const result = await runWithUser(opts?.user?.id, () => originalReplace(id, args, opts));
    const files = Array.isArray(result) ? result : [result];

    if (files.length) {
      setImmediate(() => {
        void enqueueVideoJobs(strapi, files as Array<Record<string, unknown>>, globalDefaults).catch(
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            strapi.log.error(`[video-optimizer] Failed to enqueue replace jobs: ${message}`);
          }
        );
      });
    }

    return result;
  };

  const jobQueue = strapi.plugin(PLUGIN_ID).service('job-queue');

  const originalRemove = uploadService.remove.bind(uploadService);
  uploadService.remove = async (file: { id: number | string }) => {
    await jobQueue.cancelJobsForFile(Number(file.id));
    return originalRemove(file);
  };

  strapi.eventHub.on('media.delete', ({ media }: { media?: { id?: number | string } }) => {
    const fileId = Number(media?.id);

    if (!Number.isFinite(fileId) || fileId <= 0) {
      return;
    }

    void jobQueue.cancelJobsForFile(fileId);
  });

  await strapi.plugin(PLUGIN_ID).service('preference').ensureGlobalSettingsDefaults();
  await jobQueue.clearJobsOnStartup();
};
