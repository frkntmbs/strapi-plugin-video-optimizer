import {
  clampMaxConcurrentJobs,
  clampMaxFfmpegThreads,
  type GlobalOptimizationSettings,
} from './pluginId';

export const DEFAULT_GLOBAL_SETTINGS: GlobalOptimizationSettings = {
  defaultChoice: 'original',
  defaultFormat: 'mp4',
  videoCodec: 'h264',
  crf: 23,
  preset: 'medium',
  maxWidth: 1920,
  maxHeight: 1080,
  audioMode: 'compress',
  audioBitrate: '128k',
  maxConcurrentJobs: 1,
  maxFfmpegThreads: 2,
};

export const mergeGlobalSettings = (
  partial?: Partial<GlobalOptimizationSettings> | null
): GlobalOptimizationSettings => ({
  ...DEFAULT_GLOBAL_SETTINGS,
  ...partial,
  maxConcurrentJobs: clampMaxConcurrentJobs(
    partial?.maxConcurrentJobs ?? DEFAULT_GLOBAL_SETTINGS.maxConcurrentJobs
  ),
  maxFfmpegThreads: clampMaxFfmpegThreads(
    partial?.maxFfmpegThreads ?? DEFAULT_GLOBAL_SETTINGS.maxFfmpegThreads
  ),
});
