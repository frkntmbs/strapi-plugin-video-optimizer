import fs from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import ffmpeg, { type FfmpegCommand } from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import type { Core } from '@strapi/strapi';
import { file as fileUtils } from '@strapi/utils';
import type { OptimizationSettings } from '../constants';
import { clampMaxFfmpegThreads } from '../constants';

const { bytesToKbytes } = fileUtils;

let ffmpegPathConfigured = false;

const activeCommands = new Map<string, { command: FfmpegCommand; outputPath: string }>();

const configureFfmpegPath = () => {
  if (ffmpegPathConfigured) {
    return;
  }

  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
    ffmpegPathConfigured = true;
    return;
  }

  try {
    const systemPath = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (systemPath) {
      ffmpeg.setFfmpegPath(systemPath);
      ffmpegPathConfigured = true;
    }
  } catch {
    // Fall through — fluent-ffmpeg will try PATH at runtime.
  }
};

interface VideoMetadata {
  width?: number;
  height?: number;
  duration?: number;
}

const probeVideo = (inputPath: string): Promise<VideoMetadata> =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }

      const videoStream = metadata.streams.find((stream) => stream.codec_type === 'video');

      resolve({
        width: videoStream?.width ?? undefined,
        height: videoStream?.height ?? undefined,
        duration: metadata.format.duration ?? undefined,
      });
    });
  });

const buildScaleFilter = (
  settings: OptimizationSettings,
  metadata: VideoMetadata,
  resizeMode: 'exact' | 'fit-within' = 'exact'
) => {
  const targetWidth = settings.maxWidth;
  const targetHeight = settings.maxHeight;
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (!targetWidth || !targetHeight || !sourceWidth || !sourceHeight) {
    return null;
  }

  if (targetWidth === sourceWidth && targetHeight === sourceHeight) {
    return null;
  }

  if (resizeMode === 'fit-within') {
    if (sourceWidth <= targetWidth && sourceHeight <= targetHeight) {
      return null;
    }

    return `scale='min(${targetWidth},iw)':'min(${targetHeight},ih)':force_original_aspect_ratio=decrease`;
  }

  return `scale=${targetWidth}:${targetHeight}`;
};

const buildVideoCodecOptions = (settings: OptimizationSettings, maxThreads: number) => {
  if (settings.defaultFormat === 'webm' || settings.videoCodec === 'vp9') {
    return {
      videoCodec: 'libvpx-vp9',
      outputOptions: [
        '-crf',
        String(settings.crf),
        '-b:v',
        '0',
        '-row-mt',
        maxThreads > 1 ? '1' : '0',
        '-speed',
        '4',
      ],
    };
  }

  return {
    videoCodec: 'libx264',
    outputOptions: [`-crf`, String(settings.crf), '-preset', settings.preset],
  };
};

const buildThreadOptions = (maxThreads: number) => {
  const threads = clampMaxFfmpegThreads(maxThreads);

  return ['-threads', String(threads)];
};

const buildAudioOptions = (settings: OptimizationSettings) => {
  if (settings.audioMode === 'remove') {
    return { audioCodec: undefined as string | undefined, outputOptions: ['-an'] };
  }

  if (settings.audioMode === 'compress') {
    const codec = settings.defaultFormat === 'webm' ? 'libopus' : 'aac';
    return {
      audioCodec: codec,
      outputOptions: ['-b:a', settings.audioBitrate],
    };
  }

  return { audioCodec: undefined as string | undefined, outputOptions: [] as string[] };
};

export interface ProcessOptions {
  jobId: string;
  inputPath: string;
  settings: OptimizationSettings;
  resizeMode?: 'exact' | 'fit-within';
  onProgress?: (progress: number, stage: string) => void;
}

export interface ProcessResult {
  outputPath: string;
  width?: number;
  height?: number;
  sizeInBytes: number;
  ext: string;
  mime: string;
  name: string;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  cancel(jobId: string) {
    const active = activeCommands.get(jobId);

    if (!active) {
      return false;
    }

    try {
      active.command.kill('SIGKILL');
    } catch {
      // Ignore kill errors.
    }

    try {
      if (fs.existsSync(active.outputPath)) {
        fs.unlinkSync(active.outputPath);
      }
    } catch {
      // Ignore cleanup errors.
    }

    activeCommands.delete(jobId);
    return true;
  },

  async process({
    jobId,
    inputPath,
    settings,
    resizeMode = 'exact',
    onProgress,
  }: ProcessOptions): Promise<ProcessResult> {
    configureFfmpegPath();

    const metadata = await probeVideo(inputPath);
    const outputExt = settings.defaultFormat === 'webm' ? '.webm' : '.mp4';
    const outputMime = settings.defaultFormat === 'webm' ? 'video/webm' : 'video/mp4';
    const outputPath = join(tmpdir(), `video-optimizer-${randomUUID()}${outputExt}`);

    const scaleFilter = buildScaleFilter(settings, metadata, resizeMode);
    const globalSettings = await strapi
      .plugin('video-optimizer')
      .service('preference')
      .getGlobalSettings();
    const maxThreads = globalSettings.maxFfmpegThreads;
    const videoOptions = buildVideoCodecOptions(settings, maxThreads);
    const audioOptions = buildAudioOptions(settings);
    const threadOptions = buildThreadOptions(maxThreads);
    const duration = metadata.duration ?? 0;

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(inputPath);

      if (scaleFilter) {
        command = command.videoFilters(scaleFilter);
      }

      command = command
        .format(settings.defaultFormat)
        .videoCodec(videoOptions.videoCodec)
        .outputOptions([
          ...threadOptions,
          ...videoOptions.outputOptions,
          ...audioOptions.outputOptions,
        ]);

      if (audioOptions.audioCodec) {
        command = command.audioCodec(audioOptions.audioCodec);
      }

      activeCommands.set(jobId, { command, outputPath });

      command
        .on('start', () => {
          onProgress?.(5, 'encoding');
        })
        .on('progress', (progress) => {
          if (!duration || !progress.timemark) {
            onProgress?.(50, 'encoding');
            return;
          }

          const parts = progress.timemark.split(':').map(Number);
          const seconds =
            (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
          const ratio = Math.min(1, seconds / duration);
          onProgress?.(Math.round(5 + ratio * 90), 'encoding');
        })
        .on('end', () => {
          onProgress?.(98, 'finalizing');
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        })
        .save(outputPath);
    }).finally(() => {
      activeCommands.delete(jobId);
    });

    const outputMetadata = await probeVideo(outputPath);
    const stats = fs.statSync(outputPath);
    const baseName = inputPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'video';

    return {
      outputPath,
      width: outputMetadata.width,
      height: outputMetadata.height,
      sizeInBytes: stats.size,
      ext: outputExt,
      mime: outputMime,
      name: `${baseName}${outputExt}`,
    };
  },

  async cleanup(path: string) {
    try {
      if (fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    } catch {
      // Ignore cleanup errors.
    }
  },

  bytesToKbytes,
});
