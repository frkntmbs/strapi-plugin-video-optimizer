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

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export const OPTIMIZATION_CHOICES: OptimizationChoice[] = ['original', 'global', 'custom'];
export const VIDEO_FORMATS: VideoFormat[] = ['mp4', 'webm'];
export const VIDEO_CODECS: VideoCodec[] = ['h264', 'vp9'];
export const AUDIO_MODES: AudioMode[] = ['keep', 'remove', 'compress'];
export const FFMPEG_PRESETS: FfmpegPreset[] = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
];
export const JOB_STATUSES: JobStatus[] = ['queued', 'processing', 'completed', 'failed'];

export const MAX_CONCURRENT_JOBS_LIMIT = 32;

export const clampMaxConcurrentJobs = (value: number) =>
  Math.min(MAX_CONCURRENT_JOBS_LIMIT, Math.max(1, Math.round(value)));

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

export interface ResolvedOptimization {
  skip: boolean;
  settings?: OptimizationSettings;
}

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

export const isVideoMime = (mime: unknown): boolean =>
  typeof mime === 'string' && mime.startsWith('video/');

export const codecForFormat = (format: VideoFormat): VideoCodec =>
  format === 'webm' ? 'vp9' : 'h264';

export const formatForCodec = (codec: VideoCodec): VideoFormat =>
  codec === 'vp9' ? 'webm' : 'mp4';
