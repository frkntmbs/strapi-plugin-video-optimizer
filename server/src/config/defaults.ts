import {
  AUDIO_MODES,
  FFMPEG_PRESETS,
  OPTIMIZATION_CHOICES,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  clampMaxConcurrentJobs,
  clampMaxFfmpegThreads,
  codecForFormat,
  type AudioMode,
  type FfmpegPreset,
  type OptimizationChoice,
  type VideoCodec,
  type VideoFormat,
} from '../constants';
import type { PluginConfig } from './index';

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
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

export const normalizePluginConfig = (
  ...sources: Array<Partial<PluginConfig> | undefined>
): PluginConfig => {
  const merged = Object.assign({}, DEFAULT_PLUGIN_CONFIG, ...sources.filter(Boolean));

  const defaultFormat = isValidFormat(merged.defaultFormat)
    ? merged.defaultFormat
    : DEFAULT_PLUGIN_CONFIG.defaultFormat;

  return {
    defaultChoice: isValidChoice(merged.defaultChoice)
      ? merged.defaultChoice
      : DEFAULT_PLUGIN_CONFIG.defaultChoice,
    defaultFormat,
    videoCodec: isValidCodec(merged.videoCodec)
      ? merged.videoCodec
      : codecForFormat(defaultFormat),
    crf:
      typeof merged.crf === 'number' && merged.crf >= 0 && merged.crf <= 51
        ? merged.crf
        : DEFAULT_PLUGIN_CONFIG.crf,
    preset: isValidPreset(merged.preset) ? merged.preset : DEFAULT_PLUGIN_CONFIG.preset,
    maxWidth:
      typeof merged.maxWidth === 'number' && merged.maxWidth >= 1
        ? merged.maxWidth
        : DEFAULT_PLUGIN_CONFIG.maxWidth,
    maxHeight:
      typeof merged.maxHeight === 'number' && merged.maxHeight >= 1
        ? merged.maxHeight
        : DEFAULT_PLUGIN_CONFIG.maxHeight,
    audioMode: isValidAudioMode(merged.audioMode)
      ? merged.audioMode
      : DEFAULT_PLUGIN_CONFIG.audioMode,
    audioBitrate:
      typeof merged.audioBitrate === 'string' && merged.audioBitrate.trim()
        ? merged.audioBitrate
        : DEFAULT_PLUGIN_CONFIG.audioBitrate,
    maxConcurrentJobs: clampMaxConcurrentJobs(
      merged.maxConcurrentJobs ?? DEFAULT_PLUGIN_CONFIG.maxConcurrentJobs
    ),
    maxFfmpegThreads: clampMaxFfmpegThreads(
      merged.maxFfmpegThreads ?? DEFAULT_PLUGIN_CONFIG.maxFfmpegThreads
    ),
  };
};
