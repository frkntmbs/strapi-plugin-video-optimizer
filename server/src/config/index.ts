import type {
  AudioMode,
  FfmpegPreset,
  OptimizationChoice,
  VideoCodec,
  VideoFormat,
} from '../constants';
import { MAX_CONCURRENT_JOBS_LIMIT, MAX_FFMPEG_THREADS_LIMIT, clampMaxConcurrentJobs, clampMaxFfmpegThreads } from '../constants';

import { DEFAULT_PLUGIN_CONFIG } from './defaults';

export interface PluginConfig {
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

export default {
  default: (): PluginConfig => ({ ...DEFAULT_PLUGIN_CONFIG }),
  validator(config: Partial<PluginConfig>) {
    if (config.crf !== undefined && (config.crf < 0 || config.crf > 51)) {
      throw new Error('crf must be between 0 and 51');
    }
    if (config.maxWidth !== undefined && config.maxWidth < 1) {
      throw new Error('maxWidth must be at least 1');
    }
    if (config.maxHeight !== undefined && config.maxHeight < 1) {
      throw new Error('maxHeight must be at least 1');
    }
    if (
      config.maxConcurrentJobs !== undefined &&
      clampMaxConcurrentJobs(config.maxConcurrentJobs) !== config.maxConcurrentJobs
    ) {
      throw new Error(`maxConcurrentJobs must be between 1 and ${MAX_CONCURRENT_JOBS_LIMIT}`);
    }
    if (
      config.maxFfmpegThreads !== undefined &&
      clampMaxFfmpegThreads(config.maxFfmpegThreads) !== config.maxFfmpegThreads
    ) {
      throw new Error(`maxFfmpegThreads must be between 1 and ${MAX_FFMPEG_THREADS_LIMIT}`);
    }
  },
};
