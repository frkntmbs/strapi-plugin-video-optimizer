export const probeVideoFileDimensions = (
  file: File
): Promise<{ width: number; height: number } | undefined> =>
  probeVideoFileMetadata(file).then((metadata) =>
    metadata?.width && metadata?.height
      ? { width: metadata.width, height: metadata.height }
      : undefined
  );

export const probeVideoFileMetadata = (
  file: File
): Promise<
  { width: number; height: number; durationSeconds?: number; sizeBytes: number } | undefined
> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const metadata =
        video.videoWidth > 0 && video.videoHeight > 0
          ? {
              width: video.videoWidth,
              height: video.videoHeight,
              durationSeconds:
                Number.isFinite(video.duration) && video.duration > 0
                  ? video.duration
                  : undefined,
              sizeBytes: file.size,
            }
          : undefined;
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      resolve(undefined);
    };

    video.src = url;
  });

export const findUploadFilesInDialog = (dialog: Element): File[] => {
  const files: File[] = [];

  dialog.querySelectorAll('input[type="file"]').forEach((input) => {
    if (input instanceof HTMLInputElement && input.files?.length) {
      files.push(...Array.from(input.files));
    }
  });

  return files;
};

export const matchUploadFile = (files: File[], assetName: string): File | undefined => {
  const target = assetName.trim().toLowerCase();

  return files.find((file) => {
    const name = file.name.trim().toLowerCase();
    return name === target || target.endsWith(name) || name.endsWith(target);
  });
};

export const ensureVideoElementDimensions = (
  card: Element
): Promise<{ width: number; height: number } | undefined> => {
  const video = card.querySelector('video');

  if (!(video instanceof HTMLVideoElement)) {
    return Promise.resolve(undefined);
  }

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve({ width: video.videoWidth, height: video.videoHeight });
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (dimensions?: { width: number; height: number }) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(dimensions);
    };

    video.addEventListener(
      'loadedmetadata',
      () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finish({ width: video.videoWidth, height: video.videoHeight });
          return;
        }

        finish(undefined);
      },
      { once: true }
    );

    video.load();
    window.setTimeout(() => finish(undefined), 2500);
  });
};
