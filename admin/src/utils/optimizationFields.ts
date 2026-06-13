import type { VideoFormat } from '../pluginId';

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', 'wmv', 'flv', '3gp'];

export const getVideoFormatFromName = (name?: string): VideoFormat | 'other' => {
  const ext = name?.split('.').pop()?.toLowerCase();

  if (ext === 'webm') {
    return 'webm';
  }

  if (ext === 'mp4' || ext === 'mov' || ext === 'm4v') {
    return 'mp4';
  }

  return 'other';
};
