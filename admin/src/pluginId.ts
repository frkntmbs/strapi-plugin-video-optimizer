export const PLUGIN_ID = 'video-optimizer';

export type OptimizationChoice = 'original' | 'global' | 'custom';
export type VideoFormat = 'mp4' | 'webm';
export type VideoCodec = 'h264' | 'vp9';
export type AudioMode = 'keep' | 'remove' | 'compress';
export type FfmpegPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

export interface OptimizationSettings {
  defaultFormat: VideoFormat;
  videoCodec: VideoCodec;
  crf: number;
  preset: FfmpegPreset;
  maxWidth: number;
  maxHeight: number;
  audioMode: AudioMode;
  audioBitrate: string;
}

export interface AssetOptimizationPreference {
  choice: OptimizationChoice;
  custom?: OptimizationSettings;
}

export interface GlobalOptimizationSettings {
  defaultChoice: OptimizationChoice;
  defaultFormat: VideoFormat;
  videoCodec: VideoCodec;
  crf: number;
  preset: FfmpegPreset;
  maxWidth: number;
  maxHeight: number;
  audioMode: AudioMode;
  audioBitrate: string;
  maxConcurrentJobs: number;
  maxFfmpegThreads: number;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoOptimizerJob {
  id: string;
  fileId: number;
  fileName?: string;
  fileHash?: string;
  status: JobStatus;
  stage: string;
  progress: number;
  settings?: OptimizationSettings;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const getTranslationKey = (key: string) => `${PLUGIN_ID}.${key}`;

export const MAX_CONCURRENT_JOBS_LIMIT = 32;
export const MAX_FFMPEG_THREADS_LIMIT = 8;

export const clampMaxConcurrentJobs = (value: number) =>
  Math.min(MAX_CONCURRENT_JOBS_LIMIT, Math.max(1, Math.round(value)));

export const clampMaxFfmpegThreads = (value: number) =>
  Math.min(MAX_FFMPEG_THREADS_LIMIT, Math.max(1, Math.round(value)));

export const codecForFormat = (format: VideoFormat): VideoCodec =>
  format === 'webm' ? 'vp9' : 'h264';

export const isVideoFileName = (name: string) =>
  /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)$/i.test(name);
