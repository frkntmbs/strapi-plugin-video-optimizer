import type { Core } from '@strapi/strapi';
import {
  AUDIO_MODES,
  FFMPEG_PRESETS,
  OPTIMIZATION_CHOICES,
  MAX_CONCURRENT_JOBS_LIMIT,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  clampMaxConcurrentJobs,
  codecForFormat,
  type AudioMode,
  type FfmpegPreset,
  type OptimizationChoice,
  type OptimizationSettings,
  type VideoCodec,
  type VideoFormat,
} from '../constants';

const isValidChoice = (choice: unknown): choice is OptimizationChoice =>
  typeof choice === 'string' && OPTIMIZATION_CHOICES.includes(choice as OptimizationChoice);

const isValidFormat = (format: unknown): format is VideoFormat =>
  typeof format === 'string' && VIDEO_FORMATS.includes(format as VideoFormat);

const isValidCodec = (codec: unknown): codec is VideoCodec =>
  typeof codec === 'string' && VIDEO_CODECS.includes(codec as VideoCodec);

const isValidAudioMode = (mode: unknown): mode is AudioMode =>
  typeof mode === 'string' && AUDIO_MODES.includes(mode as AudioMode);

const isValidPreset = (preset: unknown): preset is FfmpegPreset =>
  typeof preset === 'string' && FFMPEG_PRESETS.includes(preset as FfmpegPreset);

const isValidCustomSettings = (custom: unknown): custom is OptimizationSettings => {
  if (!custom || typeof custom !== 'object') {
    return false;
  }

  const value = custom as Partial<OptimizationSettings>;

  return (
    isValidFormat(value.defaultFormat) &&
    isValidCodec(value.videoCodec) &&
    typeof value.crf === 'number' &&
    value.crf >= 0 &&
    value.crf <= 51 &&
    isValidPreset(value.preset) &&
    typeof value.maxWidth === 'number' &&
    value.maxWidth >= 1 &&
    typeof value.maxHeight === 'number' &&
    value.maxHeight >= 1 &&
    isValidAudioMode(value.audioMode) &&
    typeof value.audioBitrate === 'string'
  );
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getDefaultMode(ctx) {
    const settings = await strapi.plugin('video-optimizer').service('preference').getGlobalSettings();
    ctx.body = {
      defaultChoice: settings.defaultChoice,
      defaultFormat: settings.defaultFormat,
      videoCodec: settings.videoCodec,
      crf: settings.crf,
      preset: settings.preset,
      maxWidth: settings.maxWidth,
      maxHeight: settings.maxHeight,
      audioMode: settings.audioMode,
      audioBitrate: settings.audioBitrate,
      maxConcurrentJobs: settings.maxConcurrentJobs,
    };
  },

  async getPreference(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized();
    }

    const preferenceService = strapi.plugin('video-optimizer').service('preference');
    const defaultFormat = await preferenceService.getUserPreference(userId);
    const settings = await preferenceService.getGlobalSettings();

    ctx.body = {
      defaultFormat: defaultFormat ?? settings.defaultFormat,
      defaultChoice: settings.defaultChoice,
    };
  },

  async updatePreference(ctx) {
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized();
    }

    const { defaultFormat } = ctx.request.body ?? {};

    if (!isValidFormat(defaultFormat)) {
      return ctx.badRequest('Invalid video format');
    }

    await strapi.plugin('video-optimizer').service('preference').setUserPreference(userId, defaultFormat);

    ctx.body = { defaultFormat };
  },

  async getSettings(ctx) {
    const settings = await strapi.plugin('video-optimizer').service('preference').getGlobalSettings();
    ctx.body = settings;
  },

  async updateSettings(ctx) {
    const {
      defaultChoice,
      defaultFormat,
      videoCodec,
      crf,
      preset,
      maxWidth,
      maxHeight,
      audioMode,
      audioBitrate,
      maxConcurrentJobs,
    } = ctx.request.body ?? {};

    if (defaultChoice !== undefined && !isValidChoice(defaultChoice)) {
      return ctx.badRequest('Invalid default choice');
    }

    if (defaultFormat !== undefined && !isValidFormat(defaultFormat)) {
      return ctx.badRequest('Invalid default format');
    }

    if (videoCodec !== undefined && !isValidCodec(videoCodec)) {
      return ctx.badRequest('Invalid video codec');
    }

    if (crf !== undefined && (crf < 0 || crf > 51)) {
      return ctx.badRequest('Invalid CRF value');
    }

    if (preset !== undefined && !isValidPreset(preset)) {
      return ctx.badRequest('Invalid preset');
    }

    if (maxWidth !== undefined && maxWidth < 1) {
      return ctx.badRequest('Invalid max width');
    }

    if (maxHeight !== undefined && maxHeight < 1) {
      return ctx.badRequest('Invalid max height');
    }

    if (audioMode !== undefined && !isValidAudioMode(audioMode)) {
      return ctx.badRequest('Invalid audio mode');
    }

    if (
      maxConcurrentJobs !== undefined &&
      clampMaxConcurrentJobs(Number(maxConcurrentJobs)) !== Number(maxConcurrentJobs)
    ) {
      return ctx.badRequest(`maxConcurrentJobs must be between 1 and ${MAX_CONCURRENT_JOBS_LIMIT}`);
    }

    const payload: Record<string, unknown> = {};

    if (defaultChoice !== undefined) payload.defaultChoice = defaultChoice;
    if (defaultFormat !== undefined) {
      payload.defaultFormat = defaultFormat;
      if (videoCodec === undefined) {
        payload.videoCodec = codecForFormat(defaultFormat);
      }
    }
    if (videoCodec !== undefined) payload.videoCodec = videoCodec;
    if (crf !== undefined) payload.crf = Number(crf);
    if (preset !== undefined) payload.preset = preset;
    if (maxWidth !== undefined) payload.maxWidth = Number(maxWidth);
    if (maxHeight !== undefined) payload.maxHeight = Number(maxHeight);
    if (audioMode !== undefined) payload.audioMode = audioMode;
    if (audioBitrate !== undefined) payload.audioBitrate = String(audioBitrate);
    if (maxConcurrentJobs !== undefined) payload.maxConcurrentJobs = Number(maxConcurrentJobs);

    await strapi.plugin('video-optimizer').service('preference').setGlobalSettings(payload);

    if (maxConcurrentJobs !== undefined) {
      void strapi.plugin('video-optimizer').service('job-queue').drainQueue();
    }

    const settings = await strapi.plugin('video-optimizer').service('preference').getGlobalSettings();
    ctx.body = settings;
  },
});
