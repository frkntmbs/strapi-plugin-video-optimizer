import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Core } from '@strapi/strapi';
import {
  PLUGIN_ID,
  type OptimizationChoice,
  type OptimizationSettings,
  type VideoOptimizerJob,
} from '../constants';

const FILE_MODEL_UID = 'plugin::upload.file';

interface EnqueuePayload {
  fileId: number;
  settings: OptimizationSettings;
  choice?: OptimizationChoice;
}

interface StoredJobs {
  byId: Record<string, VideoOptimizerJob>;
  byFileId: Record<string, string>;
}

const emptyStore = (): StoredJobs => ({ byId: {}, byFileId: {} });

const now = () => new Date().toISOString();

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const activeJobs = new Set<string>();
  const cancelledJobIds = new Set<string>();
  let draining = false;

  const getPreferenceService = () => strapi.plugin(PLUGIN_ID).service('preference');
  const getOptimizerService = () => strapi.plugin(PLUGIN_ID).service('optimizer');

  const loadStore = async (): Promise<StoredJobs> => {
    const stored = await getPreferenceService().getJobsStore().get<StoredJobs>();
    return stored ?? emptyStore();
  };

  const saveStore = async (store: StoredJobs) => {
    await getPreferenceService().getJobsStore().set({ value: store });
  };

  const updateJob = async (
    jobId: string,
    patch: Partial<VideoOptimizerJob>
  ): Promise<VideoOptimizerJob | null> => {
    const store = await loadStore();
    const current = store.byId[jobId];

    if (!current) {
      return null;
    }

    const next: VideoOptimizerJob = {
      ...current,
      ...patch,
      updatedAt: now(),
    };

    if (
      activeJobs.has(jobId) &&
      patch.status !== 'completed' &&
      patch.status !== 'failed'
    ) {
      next.status = 'processing';
    }

    store.byId[jobId] = next;
    await saveStore(store);
    return next;
  };

  const removeStaleJobsForFile = (store: StoredJobs, fileId: number, keepJobId?: string) => {
    for (const [jobId, job] of Object.entries(store.byId)) {
      if (job.fileId !== fileId) {
        continue;
      }

      if (jobId === keepJobId) {
        continue;
      }

      if (activeJobs.has(jobId)) {
        continue;
      }

      delete store.byId[jobId];
    }
  };

  const isCancellationError = (jobId: string, error: unknown) => {
    if (cancelledJobIds.has(jobId)) {
      return true;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    return /SIGKILL|SIGTERM|ffmpeg was killed|cancelled|canceled/i.test(error.message);
  };

  const cancelJobsForFile = async (fileId: number) => {
    const store = await loadStore();
    const matchingJobs = Object.values(store.byId).filter((job) => job.fileId === fileId);

    if (!matchingJobs.length) {
      return;
    }

    for (const job of matchingJobs) {
      cancelledJobIds.add(job.id);
      activeJobs.delete(job.id);
      getOptimizerService().cancel(job.id);
      delete store.byId[job.id];
    }

    delete store.byFileId[String(fileId)];
    await saveStore(store);

    const file = await strapi.db.query('plugin::upload.file').findOne({
      where: { id: fileId },
    });

    if (file) {
      const providerMetadata = {
        ...((file.provider_metadata as Record<string, unknown> | undefined) ?? {}),
      };

      delete providerMetadata.videoOptimizer;

      await strapi.db.query('plugin::upload.file').update({
        where: { id: fileId },
        data: {
          provider_metadata: providerMetadata,
        },
      });
    }

    strapi.log.info(`[video-optimizer] Cancelled ${matchingJobs.length} job(s) for file ${fileId}`);

    void drainQueue();
  };

  const removeJobFromStore = async (jobId: string, fileId?: number) => {
    const store = await loadStore();

    delete store.byId[jobId];

    if (fileId !== undefined && store.byFileId[String(fileId)] === jobId) {
      delete store.byFileId[String(fileId)];
    }

    await saveStore(store);
  };

  const getMaxConcurrentJobs = async () => {
    const settings = await getPreferenceService().getGlobalSettings();
    return settings.maxConcurrentJobs;
  };

  const resolveInputPath = async (fileId: number): Promise<string | null> => {
    const file = await strapi.db.query('plugin::upload.file').findOne({
      where: { id: fileId },
    });

    if (!file?.url) {
      return null;
    }

    const uploadConfig = strapi.config.get('plugin::upload') as { provider?: string };
    const provider = uploadConfig?.provider ?? 'local';

    if (provider === 'local') {
      const publicDir = strapi.dirs.static.public;
      const relativePath = String(file.url).replace(/^\//, '');
      const absolutePath = `${publicDir}/${relativePath}`;

      if (fs.existsSync(absolutePath)) {
        return absolutePath;
      }
    }

    const uploadFolder = strapi.dirs.static.public;
    const uploadsPath = `${uploadFolder}/uploads/${file.hash}${file.ext}`;

    if (fs.existsSync(uploadsPath)) {
      return uploadsPath;
    }

    return null;
  };

  const applyOptimizedFile = async (
    fileId: number,
    result: Awaited<ReturnType<ReturnType<typeof getOptimizerService>['process']>>
  ) => {
    const file = await strapi.db.query('plugin::upload.file').findOne({
      where: { id: fileId },
    });

    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    const publicDir = strapi.dirs.static.public;
    const oldRelativePath = String(file.url).replace(/^\//, '');
    const oldAbsolutePath = path.join(publicDir, oldRelativePath);
    const baseName = String(file.name).replace(/\.[^.]+$/, '');
    const newRelativePath = `/uploads/${file.hash}${result.ext}`;
    const newAbsolutePath = path.join(publicDir, newRelativePath.replace(/^\//, ''));
    const originalSizeInBytes = Number(
      file.sizeInBytes ?? (typeof file.size === 'number' ? Math.round(file.size * 1024) : 0)
    );

    if (oldAbsolutePath !== newAbsolutePath && fs.existsSync(oldAbsolutePath)) {
      fs.unlinkSync(oldAbsolutePath);
    }

    fs.mkdirSync(path.dirname(newAbsolutePath), { recursive: true });
    fs.copyFileSync(result.outputPath, newAbsolutePath);

    const updatePayload = {
      name: `${baseName}${result.ext}`,
      ext: result.ext,
      mime: result.mime,
      url: newRelativePath,
      size: getOptimizerService().bytesToKbytes(result.sizeInBytes),
      sizeInBytes: result.sizeInBytes,
      width: result.width ?? file.width,
      height: result.height ?? file.height,
      provider_metadata: {
        ...(file.provider_metadata ?? {}),
        videoOptimizer: {
          status: 'completed',
          optimizedAt: now(),
          originalSizeInBytes,
          optimizedSizeInBytes: result.sizeInBytes,
          format: result.ext.replace('.', ''),
        },
      },
    };

    const updated = await strapi.db.query(FILE_MODEL_UID).update({
      where: { id: fileId },
      data: updatePayload,
    });

    strapi.eventHub.emit('media.update', { media: updated });

    strapi.log.info(
      `[video-optimizer] File ${fileId} updated in Media Library (${Math.round(originalSizeInBytes / 1024 / 1024)}MB → ${Math.round(result.sizeInBytes / 1024 / 1024)}MB, ${result.ext})`
    );
  };

  const getTargetExt = (job: VideoOptimizerJob) =>
    job.settings?.defaultFormat === 'webm' ? '.webm' : '.mp4';

  const getOptimizerMeta = (file: Record<string, unknown>) =>
    (file.provider_metadata as { videoOptimizer?: { status?: string } } | undefined)
      ?.videoOptimizer;

  const runJob = async (jobId: string) => {
    if (!activeJobs.has(jobId)) {
      activeJobs.add(jobId);
    }

    let fileId: number | undefined;

    try {
      const store = await loadStore();
      const job = store.byId[jobId];

      if (!job) {
        return;
      }

      fileId = job.fileId;

      strapi.log.info(`[video-optimizer] Job ${jobId} started for file ${job.fileId}`);
      await updateJob(jobId, { status: 'processing', stage: 'preparing', progress: 0 });

      const file = await strapi.db.query('plugin::upload.file').findOne({
        where: { id: job.fileId },
      });

      if (!file) {
        throw new Error('Uploaded file not found');
      }

      const settings = job.settings;

      if (!settings) {
        await updateJob(jobId, {
          status: 'completed',
          stage: 'skipped',
          progress: 100,
        });
        return;
      }

      const inputPath = await resolveInputPath(job.fileId);

      if (!inputPath) {
        throw new Error('Could not resolve uploaded file path');
      }

      strapi.log.info(
        `[video-optimizer] Job ${jobId} encoding file ${job.fileId} as ${settings.defaultFormat} (input: ${inputPath})`
      );

      let lastLoggedProgress = -1;

      const result = await getOptimizerService().process({
        jobId,
        inputPath,
        settings,
        onProgress: (progress, stage) => {
          void updateJob(jobId, { status: 'processing', progress, stage });

          if (progress >= lastLoggedProgress + 10 || progress >= 95) {
            lastLoggedProgress = progress;
            strapi.log.info(
              `[video-optimizer] Job ${jobId} progress ${progress}% (${stage}, ${settings.defaultFormat})`
            );
          }
        },
      });

      await applyOptimizedFile(job.fileId, result);
      await getOptimizerService().cleanup(result.outputPath);

      await updateJob(jobId, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
      });

      await removeJobFromStore(jobId, job.fileId);

      strapi.log.info(
        `[video-optimizer] Job ${jobId} completed for file ${job.fileId} → ${result.ext} (${result.sizeInBytes} bytes)`
      );
    } catch (error) {
      if (isCancellationError(jobId, error)) {
        cancelledJobIds.delete(jobId);
        await removeJobFromStore(jobId, fileId);
        strapi.log.info(
          `[video-optimizer] Job ${jobId} cancelled${fileId ? ` for file ${fileId}` : ''}`
        );
        return;
      }

      const message = error instanceof Error ? error.message : 'Video optimization failed';

      await updateJob(jobId, {
        status: 'failed',
        stage: 'failed',
        progress: 0,
        error: message,
      });

      if (fileId) {
        const file = await strapi.db.query('plugin::upload.file').findOne({
          where: { id: fileId },
        });

        if (file) {
          await strapi.db.query('plugin::upload.file').update({
            where: { id: fileId },
            data: {
              provider_metadata: {
                ...(file.provider_metadata ?? {}),
                videoOptimizer: {
                  status: 'failed',
                  error: message,
                  failedAt: now(),
                },
              },
            },
          });
        }
      }

      strapi.log.error(`[video-optimizer] Job ${jobId} failed: ${message}`);
    } finally {
      activeJobs.delete(jobId);
      void drainQueue();
    }
  };

  const drainQueue = async () => {
    if (draining) {
      return;
    }

    draining = true;

    try {
      const maxConcurrent = await getMaxConcurrentJobs();
      const store = await loadStore();
      const queued = Object.values(store.byId)
        .filter((job) => job.status === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      for (const job of queued) {
        if (activeJobs.size >= maxConcurrent) {
          break;
        }

        if (activeJobs.has(job.id)) {
          continue;
        }

        activeJobs.add(job.id);
        void runJob(job.id);
      }
    } finally {
      draining = false;
    }
  };

  return {
    async enqueue({ fileId, settings, choice }: EnqueuePayload): Promise<VideoOptimizerJob> {
      const store = await loadStore();
      const existingId = store.byFileId[String(fileId)];
      const existingJob = existingId ? store.byId[existingId] : undefined;

      if (
        existingJob?.status === 'processing' &&
        activeJobs.has(existingId!)
      ) {
        return existingJob;
      }

      removeStaleJobsForFile(store, fileId);

      const file = await strapi.db.query('plugin::upload.file').findOne({
        where: { id: fileId },
      });

      const job: VideoOptimizerJob = {
        id: randomUUID(),
        fileId,
        fileName: file?.name ? String(file.name) : undefined,
        fileHash: file?.hash ? String(file.hash) : undefined,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        settings,
        createdAt: now(),
        updatedAt: now(),
      };

      store.byId[job.id] = job;
      store.byFileId[String(fileId)] = job.id;
      await saveStore(store);

      strapi.log.info(
        `[video-optimizer] Job ${job.id} queued for file ${fileId} (${settings.defaultFormat}, crf=${settings.crf})`
      );

      if (file) {
        await strapi.db.query('plugin::upload.file').update({
          where: { id: fileId },
          data: {
            provider_metadata: {
              ...(file.provider_metadata ?? {}),
              videoOptimizer: {
                status: 'queued',
                jobId: job.id,
                queuedAt: now(),
                ...(choice ? { choice } : {}),
              },
            },
          },
        });
      }

      void drainQueue();
      return job;
    },

    async getJob(jobId: string): Promise<VideoOptimizerJob | null> {
      const store = await loadStore();
      return store.byId[jobId] ?? null;
    },

    async getJobsByFileIds(fileIds: number[]): Promise<VideoOptimizerJob[]> {
      const store = await loadStore();
      const jobs: VideoOptimizerJob[] = [];

      for (const fileId of fileIds) {
        const jobId = store.byFileId[String(fileId)];

        if (jobId && store.byId[jobId]) {
          jobs.push(store.byId[jobId]);
        }
      }

      return jobs;
    },

    async listActiveJobs(): Promise<VideoOptimizerJob[]> {
      const store = await loadStore();
      const result: VideoOptimizerJob[] = [];
      let dirty = false;

      for (const job of Object.values(store.byId)) {
        if (job.status === 'completed' || job.status === 'failed') {
          delete store.byId[job.id];

          if (store.byFileId[String(job.fileId)] === job.id) {
            delete store.byFileId[String(job.fileId)];
          }

          dirty = true;
        }
      }

      for (const job of Object.values(store.byId)) {
        if (job.status !== 'queued' && job.status !== 'processing') {
          continue;
        }

        const canonicalJobId = store.byFileId[String(job.fileId)];
        const isRunning = activeJobs.has(job.id);
        const isCanonical = canonicalJobId === job.id;

        if (!isCanonical && !isRunning) {
          delete store.byId[job.id];
          dirty = true;
          continue;
        }

        if (isRunning && !isCanonical) {
          store.byFileId[String(job.fileId)] = job.id;

          if (canonicalJobId && canonicalJobId !== job.id && !activeJobs.has(canonicalJobId)) {
            delete store.byId[canonicalJobId];
          }

          dirty = true;
        }

        const file = await strapi.db.query('plugin::upload.file').findOne({
          where: { id: job.fileId },
        });

        if (!file) {
          await cancelJobsForFile(job.fileId);
          continue;
        }

        const optimizerMeta = getOptimizerMeta(file as Record<string, unknown>);

        if (optimizerMeta?.status === 'completed' || optimizerMeta?.status === 'failed') {
          delete store.byId[job.id];

          if (store.byFileId[String(job.fileId)] === job.id) {
            delete store.byFileId[String(job.fileId)];
          }

          dirty = true;
          continue;
        }

        let current = store.byId[job.id] ?? job;

        if (!current.fileName && file.name) {
          current = {
            ...current,
            fileName: String(file.name),
            updatedAt: now(),
          };
          store.byId[job.id] = current;
          dirty = true;
        }

        if (!current.fileHash && file.hash) {
          current = {
            ...current,
            fileHash: String(file.hash),
            updatedAt: now(),
          };
          store.byId[job.id] = current;
          dirty = true;
        }

        if (isRunning && current.status !== 'processing') {
          current = {
            ...current,
            status: 'processing',
            updatedAt: now(),
          };
          store.byId[job.id] = current;
          dirty = true;
        }

        if (current.status === 'processing' && !isRunning) {
          if (optimizerMeta?.status === 'completed' || optimizerMeta?.status === 'failed') {
            delete store.byId[job.id];

            if (store.byFileId[String(job.fileId)] === job.id) {
              delete store.byFileId[String(job.fileId)];
            }

            dirty = true;
            continue;
          }

          const targetExt = getTargetExt(current);

          if (file.ext === targetExt) {
            delete store.byId[job.id];

            if (store.byFileId[String(job.fileId)] === job.id) {
              delete store.byFileId[String(job.fileId)];
            }

            dirty = true;
            continue;
          }
        }

        result.push(store.byId[job.id] ?? current);
      }

      if (dirty) {
        await saveStore(store);
      }

      return result;
    },

    async clearJobsOnStartup() {
      const store = await loadStore();
      const jobCount = Object.keys(store.byId).length;

      if (jobCount === 0) {
        return;
      }

      await saveStore(emptyStore());

      strapi.log.info(
        `[video-optimizer] Cleared ${jobCount} persisted job(s) on startup (jobs are not resumed after restart)`
      );
    },

    drainQueue,

    cancelJobsForFile,
  };
};
