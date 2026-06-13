import type { Dispatch } from '@reduxjs/toolkit';
import type { QueryClient } from 'react-query';
import { adminApi } from '@strapi/strapi/admin';
import { adminGet } from './adminFetch';
import { syncMediaLibraryProgress } from './initMediaLibraryProgress';
import { findCardForFile } from './mediaLibraryCardMatch';
import { getWatchedJobs } from './jobProgressStore';
import {
  registerMediaLibraryQueryClientBridge,
  invalidateFetchedUploadAssets,
  type UploadAssetRecord,
} from './mediaLibraryQueryBridge';

type AppDispatch = Dispatch;

const UPLOAD_PLUGIN_ID = 'upload';

let dispatchRef: AppDispatch | null = null;
let queryClientRef: QueryClient | null = null;
const pendingInvalidations: Array<number | undefined> = [];

type UploadFileRecord = UploadAssetRecord;

const flushPendingInvalidations = () => {
  if (!dispatchRef && !queryClientRef) {
    return;
  }

  for (const fileId of pendingInvalidations.splice(0)) {
    void invalidateMediaLibraryCache(fileId);
  }
};

export const registerMediaLibraryDispatch = (dispatch: AppDispatch | null) => {
  dispatchRef = dispatch;

  if (!dispatchRef) {
    return;
  }

  flushPendingInvalidations();
};

export const registerMediaLibraryQueryClient = (queryClient: QueryClient | null) => {
  queryClientRef = queryClient;
  registerMediaLibraryQueryClientBridge(queryClient);

  if (!queryClientRef) {
    return;
  }

  flushPendingInvalidations();
};

const hasActiveEncodingJobs = () =>
  getWatchedJobs().some(
    (job) => job.status === 'queued' || job.status === 'processing'
  );

const invalidateReactQueryAssets = async () => {
  if (!queryClientRef) {
    return;
  }

  await queryClientRef.invalidateQueries([UPLOAD_PLUGIN_ID, 'assets']);
  await queryClientRef.invalidateQueries([UPLOAD_PLUGIN_ID, 'folders']);
  await queryClientRef.invalidateQueries([UPLOAD_PLUGIN_ID, 'asset-count']);
  await queryClientRef.refetchQueries([UPLOAD_PLUGIN_ID, 'assets'], {
    active: true,
  });
};

const invalidateRtkAssets = (fileId?: number) => {
  if (!dispatchRef) {
    return;
  }

  dispatchRef(
    adminApi.util.invalidateTags([
      { type: 'Asset', id: 'LIST' },
      ...(fileId ? [{ type: 'Asset' as const, id: fileId }] : []),
      { type: 'Folder', id: 'LIST' },
    ])
  );
};

const findAssetCard = (file: UploadFileRecord) => findCardForFile(file);

const toAssetUrl = (url?: string) => {
  if (!url) {
    return undefined;
  }

  return url.startsWith('/') ? `${window.strapi.backendURL}${url}` : url;
};

const updateCardFromFile = (card: Element, file: UploadFileRecord) => {
  const fileName = file.name ?? '';
  const extLabel = (file.ext ?? '').replace(/^\./, '').toLowerCase();
  const assetUrl = toAssetUrl(file.url);

  for (const titleNode of card.querySelectorAll('[id$="-title"]')) {
    if (fileName) {
      titleNode.textContent = fileName;
    }
  }

  const figcaption = card.querySelector('figcaption');

  if (figcaption && fileName) {
    figcaption.textContent = fileName;
  }

  if (extLabel) {
    for (const node of card.querySelectorAll('span, p, div')) {
      const text = node.textContent?.trim().toLowerCase();

      if (text === 'mp4' || text === 'webm' || text === 'mov' || text === 'avi' || text === 'mkv') {
        if (node.childElementCount === 0) {
          node.textContent = extLabel;
        }
      }
    }
  }

  if (assetUrl) {
    const video = card.querySelector('video');

    if (video) {
      video.src = assetUrl;
      video.load();
    }

    for (const source of card.querySelectorAll('video source')) {
      source.setAttribute('src', assetUrl);
    }
  }

  const hasActiveJob = getWatchedJobs().some(
    (job) =>
      job.fileId === file.id &&
      (job.status === 'queued' || job.status === 'processing')
  );

  if (!hasActiveJob) {
    card.querySelector('[data-video-optimizer-progress-host]')?.remove();
  }

  if (file.hash) {
    (card as HTMLElement).dataset.videoOptimizerMediaHash = file.hash;
  }

  (card as HTMLElement).dataset.videoOptimizerFileId = String(file.id);
};

export const refreshAssetCardInDom = async (fileId: number, previousFileName?: string) => {
  const file = await adminGet<UploadFileRecord>(`/upload/files/${fileId}`);

  if (!file) {
    return;
  }

  const card = findAssetCard(file);

  if (!card) {
    return;
  }

  updateCardFromFile(card, file);
  syncMediaLibraryProgress();
};

export const invalidateMediaLibraryCache = async (
  fileId?: number,
  previousFileName?: string,
  options?: { forceFullRefresh?: boolean }
) => {
  if (!dispatchRef && !queryClientRef) {
    pendingInvalidations.push(fileId);
    return;
  }

  const shouldSkipFullRefresh = hasActiveEncodingJobs() && !options?.forceFullRefresh;

  if (shouldSkipFullRefresh) {
    if (fileId) {
      await refreshAssetCardInDom(fileId, previousFileName);
    }

    syncMediaLibraryProgress();
    return;
  }

  invalidateFetchedUploadAssets();
  invalidateRtkAssets(fileId);
  await invalidateReactQueryAssets();

  if (fileId) {
    await refreshAssetCardInDom(fileId, previousFileName);
  }

  syncMediaLibraryProgress();
};
