import type { AssetOptimizationPreference, OptimizationSettings, VideoOptimizerJob } from '../pluginId';
import { adminPost } from './adminFetch';
import { wakeJobPoller } from './initJobPoller';
import {
  createCustomFromGlobal,
  createDefaultPreference,
  getGlobalSettings,
} from './uploadAssetStore';

export interface MediaLibraryCardEntry {
  fileId: number;
  fileName: string;
  width?: number;
  height?: number;
  optimizeHost: HTMLElement;
  cancelHost: HTMLElement;
}

let cards: MediaLibraryCardEntry[] = [];
let cardsSnapshot: MediaLibraryCardEntry[] = [];
const listeners = new Set<() => void>();

let editingFileId: number | null = null;
let editingFileName: string | null = null;
let editingDimensions: { width?: number; height?: number } | null = null;
let draftPreference: AssetOptimizationPreference | null = null;
let enqueueInFlight = false;
let cancelInFlight = new Set<number>();
let storeRevision = 0;

const STABLE_EMPTY_DRAFT: AssetOptimizationPreference = Object.freeze({
  choice: 'original',
  custom: undefined,
});

const notify = () => {
  storeRevision += 1;
  listeners.forEach((listener) => listener());
};

export const getMediaLibraryStoreRevision = () => storeRevision;

export const subscribeMediaLibraryCards = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getMediaLibraryCards = () => cardsSnapshot;

const refreshEntryHosts = (entry: MediaLibraryCardEntry): MediaLibraryCardEntry | null => {
  const optimizeHost = document.querySelector(
    `[data-video-optimizer-ml-optimize-host="${entry.fileId}"]`
  ) as HTMLElement | null;
  const cancelHost = document.querySelector(
    `[data-video-optimizer-ml-cancel-host="${entry.fileId}"]`
  ) as HTMLElement | null;

  if (!optimizeHost?.isConnected || !cancelHost?.isConnected) {
    return null;
  }

  return {
    ...entry,
    optimizeHost,
    cancelHost,
  };
};

export const setMediaLibraryCards = (nextCards: MediaLibraryCardEntry[]) => {
  const resolved = nextCards
    .map((entry) => refreshEntryHosts(entry))
    .filter((entry): entry is MediaLibraryCardEntry => entry !== null);

  const sameLength = resolved.length === cards.length;
  const sameEntries =
    sameLength &&
    resolved.every(
      (entry, index) =>
        entry.fileId === cards[index]?.fileId &&
        entry.optimizeHost === cards[index]?.optimizeHost &&
        entry.cancelHost === cards[index]?.cancelHost
    );

  if (sameEntries) {
    return;
  }

  cards = resolved;
  cardsSnapshot = resolved.slice();
  notify();
};

export const getEditingMediaLibraryFileId = () => editingFileId;

export const getEditingMediaLibraryFileName = () => editingFileName;

export const getEditingMediaLibraryDimensions = () => editingDimensions;

export const getMediaLibraryDraftPreference = (): AssetOptimizationPreference => {
  return draftPreference ?? STABLE_EMPTY_DRAFT;
};

export const isMediaLibraryEnqueueInFlight = () => enqueueInFlight;

export const isMediaLibraryCancelInFlight = (fileId: number) => cancelInFlight.has(fileId);

export const openMediaLibraryEditor = (
  fileId: number,
  fileName: string,
  dimensions?: { width?: number; height?: number }
) => {
  editingFileId = fileId;
  editingFileName = fileName;
  editingDimensions = dimensions ?? null;
  draftPreference = createDefaultPreference();

  if (draftPreference.choice === 'custom') {
    draftPreference.custom = createCustomForMediaLibraryFile();
  }

  notify();
};

export const closeMediaLibraryEditor = () => {
  editingFileId = null;
  editingFileName = null;
  editingDimensions = null;
  draftPreference = null;
  notify();
};

export const setMediaLibraryDraftChoice = (choice: AssetOptimizationPreference['choice']) => {
  if (!draftPreference) {
    draftPreference = createDefaultPreference();
  }

  draftPreference = {
    choice,
    custom:
      choice === 'custom'
        ? draftPreference.custom ?? createCustomForMediaLibraryFile()
        : undefined,
  };
  notify();
};

export const setMediaLibraryDraftCustom = (custom: OptimizationSettings) => {
  if (!draftPreference) {
    draftPreference = createDefaultPreference();
  }

  draftPreference = {
    choice: 'custom',
    custom,
  };
  notify();
};

export const saveMediaLibraryEditor = async () => {
  if (!editingFileId || !draftPreference || draftPreference.choice === 'original') {
    return false;
  }

  enqueueInFlight = true;
  notify();

  try {
    const result = await adminPost<{ job?: VideoOptimizerJob }>('/video-optimizer/jobs/enqueue', {
      fileId: editingFileId,
      optimizationChoice: draftPreference.choice,
      optimizationCustom:
        draftPreference.choice === 'custom' ? draftPreference.custom : undefined,
    });

    if (!result?.job) {
      return false;
    }

    closeMediaLibraryEditor();
    wakeJobPoller();
    return true;
  } finally {
    enqueueInFlight = false;
    notify();
  }
};

export const cancelMediaLibraryJob = async (fileId: number) => {
  if (cancelInFlight.has(fileId)) {
    return false;
  }

  cancelInFlight.add(fileId);
  notify();

  try {
    const result = await adminPost<{ ok?: boolean }>('/video-optimizer/jobs/cancel', { fileId });

    if (!result?.ok) {
      return false;
    }

    wakeJobPoller();
    return true;
  } finally {
    cancelInFlight.delete(fileId);
    notify();
  }
};

export const createCustomForMediaLibraryFile = (): OptimizationSettings => {
  const base = createCustomFromGlobal();
  const width = editingDimensions?.width;
  const height = editingDimensions?.height;

  return {
    ...base,
    maxWidth: width ?? base.maxWidth,
    maxHeight: height ?? base.maxHeight,
  };
};

export const getMediaLibraryDefaultChoiceLabel = () => getGlobalSettings().defaultChoice;
