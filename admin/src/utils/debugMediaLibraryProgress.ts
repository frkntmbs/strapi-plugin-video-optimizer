import type { VideoOptimizerJob } from '../pluginId';
import { adminGet } from './adminFetch';
import { getProgressEntries, getWatchedJobs } from './jobProgressStore';
import { isMediaLibraryPath } from './mediaLibraryRoute';

const VIDEO_EXT_PATTERN =
  /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i;

const CARD_SELECTOR = [
  'article[role="button"]',
  'article[aria-labelledby]',
  '[role="listitem"]',
  '[class*="CardContainer"]',
].join(', ');

const extractFileName = (card: Element): string | null => {
  const titleNode = card.querySelector('[id$="-title"]');

  if (titleNode?.textContent && VIDEO_EXT_PATTERN.test(titleNode.textContent)) {
    return titleNode.textContent.trim();
  }

  const figcaption = card.querySelector('figcaption');

  if (figcaption?.textContent && VIDEO_EXT_PATTERN.test(figcaption.textContent)) {
    return figcaption.textContent.trim();
  }

  const match = card.textContent?.match(/[\w.-]+\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i);
  return match?.[0] ?? null;
};

export const collectVideoCardsDebug = () => {
  const root = document.querySelector('main') ?? document.body;
  return Array.from(root.querySelectorAll(CARD_SELECTOR)).map((card) => ({
    fileName: extractFileName(card),
    hasProgressHost: Boolean(card.querySelector('[data-video-optimizer-progress-host]')),
    fileIdStamp: card.getAttribute('data-video-optimizer-file-id'),
  }));
};

export const debugMediaLibraryProgress = async () => {
  const api = await adminGet<{ jobs?: VideoOptimizerJob[] }>('/video-optimizer/jobs/active');

  return {
    path: window.location.pathname,
    isMediaLibraryRoute: isMediaLibraryPath(window.location.pathname),
    watchedJobs: getWatchedJobs(),
    progressEntries: getProgressEntries().map((entry) => ({
      fileId: entry.fileId,
      jobId: entry.job.id,
      progress: entry.job.progress,
      status: entry.job.status,
      fileName: entry.job.fileName,
      hostConnected: entry.host.isConnected,
    })),
    apiJobs: api?.jobs ?? null,
    cards: collectVideoCardsDebug(),
    bridgeMounted: Boolean(document.getElementById('video-optimizer-media-library-progress')),
  };
};

export const installDebugMediaLibraryProgress = () => {
  if (typeof window === 'undefined') {
    return;
  }

  (window as Window & { __videoOptimizerDebug?: typeof debugMediaLibraryProgress }).__videoOptimizerDebug =
    debugMediaLibraryProgress;
};
