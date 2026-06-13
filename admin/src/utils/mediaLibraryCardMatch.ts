import type { VideoOptimizerJob } from '../pluginId';
import {
  getUploadAssetsFromCache,
  type UploadAssetRecord,
} from './mediaLibraryQueryBridge';

const CARD_SELECTOR = [
  'article[role="button"]',
  'article[aria-labelledby]',
  '[role="listitem"]',
  '[class*="CardContainer"]',
].join(', ');

const VIDEO_EXT_PATTERN =
  /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i;

const watchedCards = new WeakSet<Element>();
const jobCardRefs = new Map<number, Element>();

export const extractMediaUrlFromCard = (card: Element): string | null => {
  const video = card.querySelector('video');

  if (video?.src && !video.src.startsWith('blob:')) {
    return video.src;
  }

  const source = video?.querySelector('source');

  if (source?.src && !source.src.startsWith('blob:')) {
    return source.src;
  }

  return null;
};

export const extractFileHashFromUrl = (url: string): string | null => {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const filename = decodeURIComponent(pathname.split('/').pop() ?? '');
    const match = filename.match(/_([a-z0-9]+)\.[^.]+$/i);

    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const extractFileNameFromCard = (card: Element): string | null => {
  const titleNode = card.querySelector('[id$="-title"]');

  if (titleNode?.textContent?.trim()) {
    return titleNode.textContent.trim();
  }

  const figcaption = card.querySelector('figcaption');

  if (figcaption?.textContent?.trim()) {
    return figcaption.textContent.trim();
  }

  return null;
};

const cacheCardMediaHash = (card: Element, hash: string) => {
  (card as HTMLElement).dataset.videoOptimizerMediaHash = hash;
};

export const extractFileHashFromCard = (card: Element): string | null => {
  const htmlCard = card as HTMLElement;
  const cached = htmlCard.dataset.videoOptimizerMediaHash;

  if (cached) {
    return cached;
  }

  const url = extractMediaUrlFromCard(card);

  if (!url) {
    return null;
  }

  const hash = extractFileHashFromUrl(url);

  if (hash) {
    cacheCardMediaHash(card, hash);
  }

  return hash;
};

export const ensureCardMediaHash = (card: Element, onReady?: () => void) => {
  const existing = extractFileHashFromCard(card);

  if (existing) {
    cacheCardMediaHash(card, existing);
    return existing;
  }

  if (watchedCards.has(card)) {
    return null;
  }

  watchedCards.add(card);

  const video = card.querySelector('video');

  if (!video) {
    return null;
  }

  const capture = () => {
    const url = video.src;

    if (!url || url.startsWith('blob:')) {
      return;
    }

    const hash = extractFileHashFromUrl(url);

    if (!hash) {
      return;
    }

    cacheCardMediaHash(card, hash);
    onReady?.();
  };

  video.addEventListener('loadedmetadata', capture, { once: true });
  video.addEventListener('loadeddata', capture, { once: true });

  if (video.src && !video.src.startsWith('blob:')) {
    capture();
  }

  return null;
};

const cardContainsHash = (card: Element, hash: string) => {
  if (extractFileHashFromCard(card) === hash) {
    return true;
  }

  return card.innerHTML.includes(hash);
};

export const cardMatchesJob = (
  card: Element,
  job: Pick<VideoOptimizerJob, 'fileId' | 'fileHash'>
) => {
  if (!job.fileHash) {
    return true;
  }

  return cardContainsHash(card, job.fileHash);
};

export const isVideoAssetCard = (card: Element) => {
  if (card.querySelector('video, canvas')) {
    return true;
  }

  const text = card.textContent ?? '';

  if (!VIDEO_EXT_PATTERN.test(text)) {
    return false;
  }

  if (card.querySelector('time')) {
    return true;
  }

  const hasVideoLabel = Array.from(card.querySelectorAll('span')).some(
    (node) => node.textContent?.trim().toLowerCase() === 'video'
  );

  return hasVideoLabel;
};

export const collectVideoCards = () => {
  const seen = new Set<Element>();
  const cards: Element[] = [];
  const root = document.querySelector('main') ?? document.body;

  for (const candidate of root.querySelectorAll(CARD_SELECTOR)) {
    if (!candidate.matches(CARD_SELECTOR) || seen.has(candidate) || !isVideoAssetCard(candidate)) {
      continue;
    }

    seen.add(candidate);
    cards.push(candidate);
  }

  return cards;
};

export const prepareCardsForMatching = (cards: Element[], onReady?: () => void) => {
  for (const card of cards) {
    ensureCardMediaHash(card, onReady);
  }
};

const findCardByFileRecord = (
  file: Pick<UploadAssetRecord, 'id' | 'name' | 'hash'>,
  cards: Element[],
  assignedCards: Set<Element>,
  uploadAssets: UploadAssetRecord[]
) => {
  if (file.hash) {
    for (const card of cards) {
      if (assignedCards.has(card)) {
        continue;
      }

      if (cardContainsHash(card, file.hash)) {
        return card;
      }
    }
  }

  const fileName = file.name;

  if (!fileName) {
    return null;
  }

  const sameNameFiles = uploadAssets.filter((asset) => asset.name === fileName);
  const sameNameCards = cards.filter((card) => {
    if (assignedCards.has(card)) {
      return false;
    }

    return extractFileNameFromCard(card) === fileName;
  });

  if (sameNameFiles.length === 1 && sameNameCards.length === 1) {
    return sameNameCards[0] ?? null;
  }

  const fileIndex = sameNameFiles.findIndex((asset) => asset.id === file.id);

  if (fileIndex >= 0 && fileIndex < sameNameCards.length) {
    return sameNameCards[fileIndex] ?? null;
  }

  return null;
};

export const findCardForJob = (
  job: Pick<VideoOptimizerJob, 'fileId' | 'fileHash' | 'fileName'>,
  cards: Element[],
  assignedCards: Set<Element>,
  uploadAssets: UploadAssetRecord[] = getUploadAssetsFromCache()
) => {
  const stamped = document.querySelector(
    `[data-video-optimizer-file-id="${job.fileId}"]`
  ) as HTMLElement | null;

  if (stamped?.isConnected && !assignedCards.has(stamped)) {
    jobCardRefs.set(job.fileId, stamped);
    return stamped;
  }

  const previous = jobCardRefs.get(job.fileId);

  if (previous?.isConnected && !assignedCards.has(previous)) {
    return previous;
  }

  jobCardRefs.delete(job.fileId);

  if (job.fileHash) {
    for (const card of cards) {
      if (assignedCards.has(card)) {
        continue;
      }

      if (cardContainsHash(card, job.fileHash)) {
        jobCardRefs.set(job.fileId, card);
        cacheCardMediaHash(card, job.fileHash);
        return card;
      }
    }
  }

  const fileRecord =
    uploadAssets.find((asset) => asset.id === job.fileId) ??
    (job.fileHash || job.fileName
      ? { id: job.fileId, hash: job.fileHash, name: job.fileName }
      : null);

  if (!fileRecord) {
    return null;
  }

  const matched = findCardByFileRecord(fileRecord, cards, assignedCards, uploadAssets);

  if (matched) {
    jobCardRefs.set(job.fileId, matched);

    if (fileRecord.hash) {
      cacheCardMediaHash(matched, fileRecord.hash);
    }
  }

  return matched;
};

export const findCardForFile = (
  file: { id: number; hash?: string; url?: string; name?: string },
  assignedCards?: Set<Element>
) => {
  const cards = collectVideoCards();
  prepareCardsForMatching(cards);

  return findCardForJob(
    {
      fileId: file.id,
      fileHash: file.hash ?? (file.url ? extractFileHashFromUrl(file.url) ?? undefined : undefined),
      fileName: file.name,
    },
    cards,
    assignedCards ?? new Set()
  );
};

export const cleanupOrphanProgressHosts = (activeFileIds: Set<number>) => {
  for (const host of document.querySelectorAll('[data-video-optimizer-progress-host]')) {
    const fileId = Number(host.getAttribute('data-video-optimizer-progress-host'));

    if (!activeFileIds.has(fileId)) {
      host.remove();
    }
  }

  for (const card of document.querySelectorAll('[data-video-optimizer-file-id]')) {
    const fileId = Number((card as HTMLElement).dataset.videoOptimizerFileId);

    if (!activeFileIds.has(fileId)) {
      delete (card as HTMLElement).dataset.videoOptimizerFileId;
      jobCardRefs.delete(fileId);
    }
  }
};

export const clearJobCardRefs = (activeFileIds: Set<number>) => {
  for (const fileId of jobCardRefs.keys()) {
    if (!activeFileIds.has(fileId)) {
      jobCardRefs.delete(fileId);
    }
  }
};

export const resolveFileIdForCard = (
  card: Element,
  uploadAssets: UploadAssetRecord[] = getUploadAssetsFromCache()
): number | null => {
  const stamped = (card as HTMLElement).dataset.videoOptimizerFileId;

  if (stamped) {
    const fileId = Number(stamped);

    if (Number.isFinite(fileId) && fileId > 0) {
      return fileId;
    }
  }

  const hash = extractFileHashFromCard(card);

  if (hash) {
    const matches = uploadAssets.filter((asset) => asset.hash === hash);

    if (matches.length === 1) {
      return matches[0]!.id;
    }

    if (matches.length > 1) {
      const cards = collectVideoCards().filter((candidate) => cardContainsHash(candidate, hash));
      const cardIndex = cards.indexOf(card);

      if (cardIndex >= 0 && cardIndex < matches.length) {
        return matches[cardIndex]!.id;
      }
    }
  }

  const fileName = extractFileNameFromCard(card);

  if (!fileName) {
    return null;
  }

  const exactMatches = uploadAssets.filter((asset) => asset.name === fileName);

  if (exactMatches.length === 1) {
    return exactMatches[0]!.id;
  }

  const sameNameFiles = exactMatches;
  const sameNameCards = collectVideoCards().filter(
    (candidate) => extractFileNameFromCard(candidate) === fileName
  );

  if (sameNameFiles.length === 1 && sameNameCards.length === 1) {
    return sameNameFiles[0]!.id;
  }

  const fileIndex = sameNameCards.indexOf(card);

  if (fileIndex >= 0 && fileIndex < sameNameFiles.length) {
    return sameNameFiles[fileIndex]!.id;
  }

  return null;
};
