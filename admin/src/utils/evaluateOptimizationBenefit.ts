import type {
  GlobalOptimizationSettings,
  OptimizationChoice,
  OptimizationSettings,
} from '../pluginId';

export interface VideoSourceMetadata {
  width?: number;
  height?: number;
  sizeBytes?: number;
  durationSeconds?: number;
}

const willResize = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  resizeMode: 'exact' | 'fit-within'
) => {
  if (targetWidth === sourceWidth && targetHeight === sourceHeight) {
    return false;
  }

  if (resizeMode === 'fit-within') {
    return sourceWidth > targetWidth || sourceHeight > targetHeight;
  }

  return true;
};

const bitrateMbps = (sizeBytes: number, durationSeconds: number) =>
  (sizeBytes * 8) / durationSeconds / 1_000_000;

const maxBitrateMbpsForResolution = (maxDimension: number) => {
  if (maxDimension <= 720) {
    return 1.5;
  }

  if (maxDimension <= 1080) {
    return 2.5;
  }

  if (maxDimension <= 1440) {
    return 5;
  }

  return 8;
};

const isBitrateAlreadyEfficient = (metadata: VideoSourceMetadata) => {
  const { width, height, sizeBytes, durationSeconds } = metadata;

  if (!width || !height || !sizeBytes || !durationSeconds || durationSeconds <= 0) {
    return false;
  }

  const maxDimension = Math.max(width, height);
  const bitrate = bitrateMbps(sizeBytes, durationSeconds);

  return bitrate <= maxBitrateMbpsForResolution(maxDimension);
};

export const evaluateOptimizationBenefit = (
  choice: OptimizationChoice,
  metadata: VideoSourceMetadata,
  globalSettings: GlobalOptimizationSettings,
  customSettings?: OptimizationSettings
): boolean => {
  if (choice === 'original') {
    return false;
  }

  const { width, height } = metadata;

  if (!width || !height) {
    return false;
  }

  if (choice === 'global') {
    const wouldResize = willResize(
      width,
      height,
      globalSettings.maxWidth,
      globalSettings.maxHeight,
      'fit-within'
    );

    if (wouldResize) {
      return false;
    }

    return isBitrateAlreadyEfficient(metadata) || Boolean(metadata.sizeBytes);
  }

  if (choice === 'custom' && customSettings) {
    const wouldResizeCustom = willResize(
      width,
      height,
      customSettings.maxWidth,
      customSettings.maxHeight,
      'exact'
    );

    if (wouldResizeCustom) {
      return false;
    }

    return isBitrateAlreadyEfficient(metadata) || Boolean(metadata.sizeBytes);
  }

  return false;
};
