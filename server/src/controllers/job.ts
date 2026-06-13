import type { Core } from '@strapi/strapi';
import {
  OPTIMIZATION_CHOICES,
  type OptimizationChoice,
  type OptimizationSettings,
} from '../constants';

const isValidChoice = (choice: unknown): choice is OptimizationChoice =>
  typeof choice === 'string' && OPTIMIZATION_CHOICES.includes(choice as OptimizationChoice);

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getJob(ctx) {
    const { id } = ctx.params;
    const job = await strapi.plugin('video-optimizer').service('job-queue').getJob(id);

    if (!job) {
      return ctx.notFound('Job not found');
    }

    ctx.body = job;
  },

  async getJobsByFiles(ctx) {
    const raw = ctx.query.fileIds;

    if (!raw || typeof raw !== 'string') {
      return ctx.badRequest('fileIds query parameter is required');
    }

    const fileIds = raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    const jobs = await strapi.plugin('video-optimizer').service('job-queue').getJobsByFileIds(fileIds);
    ctx.body = { jobs };
  },

  async listActive(ctx) {
    const jobs = await strapi.plugin('video-optimizer').service('job-queue').listActiveJobs();
    ctx.body = { jobs };
  },

  async enqueueFile(ctx) {
    const body = ctx.request.body as {
      fileId?: number | string;
      optimizationChoice?: OptimizationChoice;
      optimizationCustom?: Partial<OptimizationSettings>;
    };

    const fileId = Number(body.fileId);

    if (!Number.isFinite(fileId) || fileId <= 0) {
      return ctx.badRequest('fileId is required');
    }

    const file = await strapi.db.query('plugin::upload.file').findOne({
      where: { id: fileId },
    });

    if (!file) {
      return ctx.notFound('File not found');
    }

    if (!file.mime || !String(file.mime).startsWith('video/')) {
      return ctx.badRequest('Only video files can be optimized');
    }

    const preferenceService = strapi.plugin('video-optimizer').service('preference');
    const resolved = await preferenceService.resolveOptimization({
      optimizationChoice: isValidChoice(body.optimizationChoice)
        ? body.optimizationChoice
        : undefined,
      optimizationCustom: body.optimizationCustom,
      mime: String(file.mime),
    });

    if (resolved.skip || !resolved.settings) {
      return ctx.badRequest('Optimization is disabled for the selected choice');
    }

    const job = await strapi.plugin('video-optimizer').service('job-queue').enqueue({
      fileId,
      settings: resolved.settings,
      choice: isValidChoice(body.optimizationChoice) ? body.optimizationChoice : undefined,
    });

    ctx.body = { job };
  },

  async cancelForFile(ctx) {
    const body = ctx.request.body as { fileId?: number | string };
    const fileId = Number(body.fileId);

    if (!Number.isFinite(fileId) || fileId <= 0) {
      return ctx.badRequest('fileId is required');
    }

    await strapi.plugin('video-optimizer').service('job-queue').cancelJobsForFile(fileId);
    ctx.body = { ok: true };
  },
});
