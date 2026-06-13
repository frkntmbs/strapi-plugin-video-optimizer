import type { Core } from '@strapi/strapi';
import {
  AUDIO_MODES,
  FFMPEG_PRESETS,
  OPTIMIZATION_CHOICES,
  PLUGIN_ID,
  VIDEO_CODECS,
  VIDEO_FORMATS,
  clampMaxConcurrentJobs,
  codecForFormat,
  type AudioMode,
  type FfmpegPreset,
  type OptimizationChoice,
  type OptimizationSettings,
  type ResolvedOptimization,
  type VideoCodec,
  type VideoFormat,
} from '../constants';
import type { PluginConfig } from '../config';
import { DEFAULT_PLUGIN_CONFIG, normalizePluginConfig } from '../config/defaults';

const GLOBAL_SETTINGS_KEY = 'global-settings';
const JOBS_STORE_KEY = 'jobs';

const userPreferenceKey = (userId: number) => `user-pref-${userId}`;

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

const buildSettings = (
  source: Partial<OptimizationSettings> | PluginConfig
): OptimizationSettings => {
  const defaultFormat = isValidFormat(source.defaultFormat) ? source.defaultFormat : 'mp4';
  const videoCodec = isValidCodec(source.videoCodec)
    ? source.videoCodec
    : codecForFormat(defaultFormat);

  return {
    defaultFormat,
    videoCodec,
    crf: source.crf ?? 23,
    preset: isValidPreset(source.preset) ? source.preset : 'medium',
    maxWidth: source.maxWidth ?? 1920,
    maxHeight: source.maxHeight ?? 1080,
    audioMode: isValidAudioMode(source.audioMode) ? source.audioMode : 'compress',
    audioBitrate: source.audioBitrate ?? '128k',
  };
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getUserPreference(userId: number): Promise<VideoFormat | null> {
    const stored = await strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: userPreferenceKey(userId),
    }).get<{ defaultFormat?: VideoFormat }>();

    if (stored?.defaultFormat && isValidFormat(stored.defaultFormat)) {
      return stored.defaultFormat;
    }

    return null;
  },

  async setUserPreference(userId: number, defaultFormat: VideoFormat) {
    await strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: userPreferenceKey(userId),
    }).set({ value: { defaultFormat } });
  },

  async getGlobalSettings(): Promise<PluginConfig> {
    const pluginConfig = strapi.plugin(PLUGIN_ID).config as Partial<PluginConfig>;
    const stored = await strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: GLOBAL_SETTINGS_KEY,
    }).get<Partial<PluginConfig>>();

    return normalizePluginConfig(DEFAULT_PLUGIN_CONFIG, pluginConfig, stored ?? undefined);
  },

  async ensureGlobalSettingsDefaults() {
    const store = strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: GLOBAL_SETTINGS_KEY,
    });
    const stored = await store.get<Partial<PluginConfig>>();

    if (!stored || Object.keys(stored).length === 0) {
      const pluginConfig = strapi.plugin(PLUGIN_ID).config as Partial<PluginConfig>;
      const defaults = normalizePluginConfig(DEFAULT_PLUGIN_CONFIG, pluginConfig);
      await store.set({ value: defaults });
    }
  },

  async setGlobalSettings(settings: Partial<PluginConfig>) {
    const current = await this.getGlobalSettings();
    const next = { ...current, ...settings };

    await strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: GLOBAL_SETTINGS_KEY,
    }).set({ value: next });
  },

  async resolveOptimization(file: {
    optimizationChoice?: OptimizationChoice;
    optimizationCustom?: Partial<OptimizationSettings>;
    mime?: string;
  }): Promise<ResolvedOptimization> {
    const global = await this.getGlobalSettings();

    if (!file.mime || !file.mime.startsWith('video/')) {
      return { skip: true };
    }

    const choice = isValidChoice(file.optimizationChoice)
      ? file.optimizationChoice
      : global.defaultChoice;

    if (choice === 'original') {
      return { skip: true };
    }

    if (choice === 'global') {
      return {
        skip: false,
        settings: buildSettings(global),
      };
    }

    const custom = file.optimizationCustom ?? {};

    return {
      skip: false,
      settings: buildSettings({
        defaultFormat: custom.defaultFormat ?? global.defaultFormat,
        videoCodec: custom.videoCodec ?? global.videoCodec,
        crf: custom.crf ?? global.crf,
        preset: custom.preset ?? global.preset,
        maxWidth: custom.maxWidth ?? global.maxWidth,
        maxHeight: custom.maxHeight ?? global.maxHeight,
        audioMode: custom.audioMode ?? global.audioMode,
        audioBitrate: custom.audioBitrate ?? global.audioBitrate,
      }),
    };
  },

  getJobsStore() {
    return strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: JOBS_STORE_KEY,
    });
  },
});
