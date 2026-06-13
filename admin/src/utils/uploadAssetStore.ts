import type {
  AssetOptimizationPreference,
  GlobalOptimizationSettings,
  OptimizationChoice,
  OptimizationSettings,
} from '../pluginId';
import { isVideoFileName } from '../pluginId';
import { PLUGIN_BUILD_MARKER } from '../buildVersion';
import { wakeJobPoller } from './initJobPoller';

export interface UploadAssetEntry {
  assetId: string;
  assetName: string;
  width?: number;
  height?: number;
  actionsContainer: HTMLElement;
  footerHost?: HTMLElement;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalOptimizationSettings = {
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
};

let globalSettings: GlobalOptimizationSettings = { ...DEFAULT_GLOBAL_SETTINGS };
const assetPreferencesById = new Map<string, AssetOptimizationPreference>();
const assetNamesById = new Map<string, string>();
const assetDimensionsById = new Map<string, { width: number; height: number }>();
const assetPreferencesByFileKey = new Map<string, AssetOptimizationPreference>();
const committedPreferencesByAssetId = new Map<string, AssetOptimizationPreference>();
const committedPreferencesByName = new Map<string, AssetOptimizationPreference>();
const committedAssetIdByName = new Map<string, string>();

let cards: UploadAssetEntry[] = [];
let cardsSnapshot: UploadAssetEntry[] = [];
let listeners = new Set<() => void>();
let dialogElement: HTMLElement | null = null;
let editingAssetId: string | null = null;
let draftPreference: AssetOptimizationPreference | null = null;

const STABLE_EMPTY_DRAFT: AssetOptimizationPreference = Object.freeze({
  choice: 'original',
  custom: undefined,
});

let fetchPatched = false;
let xhrPatched = false;

export const buildFileKey = (name: string, size: number, lastModified: number) =>
  `${name}::${size}::${lastModified}`;

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const subscribeUploadAssets = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getUploadAssetCards = () => cardsSnapshot;

export const getGlobalSettings = () => globalSettings;

export const setGlobalSettings = (settings: GlobalOptimizationSettings) => {
  globalSettings = settings;
  notify();
};

export const createCustomFromGlobal = (): OptimizationSettings => ({
  defaultFormat: globalSettings.defaultFormat,
  videoCodec: globalSettings.videoCodec,
  crf: globalSettings.crf,
  preset: globalSettings.preset,
  maxWidth: globalSettings.maxWidth,
  maxHeight: globalSettings.maxHeight,
  audioMode: globalSettings.audioMode,
  audioBitrate: globalSettings.audioBitrate,
});

export const createCustomForAsset = (assetId: string): OptimizationSettings => {
  const dimensions = assetDimensionsById.get(assetId);
  const base = createCustomFromGlobal();

  return {
    ...base,
    maxWidth: dimensions?.width && dimensions.width < base.maxWidth ? dimensions.width : base.maxWidth,
    maxHeight:
      dimensions?.height && dimensions.height < base.maxHeight ? dimensions.height : base.maxHeight,
  };
};

export const getAssetDimensions = (assetId: string) => assetDimensionsById.get(assetId);

export const createDefaultPreference = (): AssetOptimizationPreference => {
  const choice = globalSettings.defaultChoice;

  return {
    choice,
    custom: choice === 'custom' ? createCustomFromGlobal() : undefined,
  };
};

export const getAssetPreference = (assetId: string): AssetOptimizationPreference => {
  return assetPreferencesById.get(assetId) ?? createDefaultPreference();
};

export const setAssetPreference = (assetId: string, preference: AssetOptimizationPreference) => {
  assetPreferencesById.set(assetId, preference);
  rememberCommittedPreference(assetId, assetNamesById.get(assetId), preference);
  notify();
};

export const registerAsset = (
  assetId: string,
  assetName: string,
  dimensions?: { width: number; height: number }
) => {
  if (!assetPreferencesById.has(assetId)) {
    assetPreferencesById.set(assetId, createDefaultPreference());
  }

  assetNamesById.set(assetId, assetName);

  if (dimensions?.width && dimensions?.height) {
    assetDimensionsById.set(assetId, dimensions);
  }
};

export const getUploadDialogElement = () => dialogElement;

export const setUploadDialogElement = (element: HTMLElement | null) => {
  dialogElement = element;
  notify();
};

export const getEditingAssetId = () => editingAssetId;

export const getDraftPreference = (): AssetOptimizationPreference => {
  if (draftPreference) {
    return draftPreference;
  }

  return STABLE_EMPTY_DRAFT;
};

export const openAssetEditor = (assetId: string) => {
  editingAssetId = assetId;
  draftPreference = structuredClone(getAssetPreference(assetId));

  if (draftPreference.choice === 'custom') {
    draftPreference.custom = createCustomForAsset(assetId);
  }

  notify();
};

export const closeAssetEditor = () => {
  editingAssetId = null;
  draftPreference = null;
  notify();
};

export const setDraftChoice = (choice: OptimizationChoice) => {
  if (!draftPreference) {
    draftPreference = createDefaultPreference();
  }

  draftPreference = {
    choice,
    custom:
      choice === 'custom'
        ? draftPreference.custom ?? createCustomForAsset(editingAssetId ?? '')
        : undefined,
  };
  notify();
};

export const setDraftCustom = (custom: OptimizationSettings) => {
  if (!draftPreference) {
    draftPreference = createDefaultPreference();
  }

  draftPreference = {
    choice: 'custom',
    custom,
  };
  notify();
};

export const saveAssetEditor = () => {
  if (editingAssetId && draftPreference) {
    setAssetPreference(editingAssetId, structuredClone(draftPreference));
  }
  closeAssetEditor();
};

const cardsEqual = (left: UploadAssetEntry[], right: UploadAssetEntry[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (entry, index) =>
      entry.assetId === right[index]?.assetId &&
      entry.assetName === right[index]?.assetName &&
      entry.width === right[index]?.width &&
      entry.height === right[index]?.height &&
      entry.actionsContainer === right[index]?.actionsContainer &&
      entry.footerHost === right[index]?.footerHost
  );
};

export const setUploadAssetCards = (nextCards: UploadAssetEntry[]) => {
  if (cardsEqual(cards, nextCards)) {
    return;
  }

  cards = nextCards;
  cardsSnapshot = nextCards.slice();
  notify();
};

export const clearUploadSession = () => {
  for (const [assetId, preference] of assetPreferencesById.entries()) {
    rememberCommittedPreference(assetId, assetNamesById.get(assetId), preference);
  }

  assetPreferencesById.clear();
  assetNamesById.clear();
  assetDimensionsById.clear();
  cards = [];
  cardsSnapshot = [];
  editingAssetId = null;
  draftPreference = null;
  dialogElement = null;
  notify();
};

const findPreferenceByAssetName = (
  name: string,
  file: File
): AssetOptimizationPreference | undefined => {
  for (const [assetId, assetName] of assetNamesById.entries()) {
    if (!namesMatch(assetName, name) && !namesMatch(assetName, file.name)) {
      continue;
    }

    const preference = assetPreferencesById.get(assetId);

    if (preference) {
      assetPreferencesByFileKey.set(
        buildFileKey(file.name, file.size, file.lastModified),
        preference
      );
    }

    return preference;
  }

  return undefined;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const rememberCommittedPreference = (
  assetId: string | undefined,
  assetName: string | undefined,
  preference: AssetOptimizationPreference
) => {
  const snapshot = structuredClone(preference);

  if (assetId) {
    committedPreferencesByAssetId.set(assetId, snapshot);
  }

  if (assetName) {
    committedPreferencesByName.set(normalizeName(assetName), snapshot);
  }

  if (assetId && assetName) {
    committedAssetIdByName.set(normalizeName(assetName), assetId);
  }
};

const findCommittedPreference = (
  file: File,
  parsed: Record<string, unknown>
): AssetOptimizationPreference | undefined => {
  const assetId = parsed.optimizerAssetId;

  if (typeof assetId === 'string') {
    const byAssetId = committedPreferencesByAssetId.get(assetId);
    if (byAssetId) {
      return byAssetId;
    }
  }

  const candidates = [file.name, String(parsed.name ?? '')].filter(Boolean);

  for (const candidate of candidates) {
    const byName = committedPreferencesByName.get(normalizeName(candidate));
    if (byName) {
      return byName;
    }
  }

  return undefined;
};

export const clearCommittedPreferences = () => {
  committedPreferencesByAssetId.clear();
  committedPreferencesByName.clear();
  committedAssetIdByName.clear();
};

const namesMatch = (left: string, right: string) => normalizeName(left) === normalizeName(right);

const findCardForFile = (file: File, parsed: Record<string, unknown>, index: number, batchSize: number) => {
  if (batchSize > 1 && batchSize === cardsSnapshot.length) {
    return cardsSnapshot[index];
  }

  const candidates = [String(parsed.name ?? ''), file.name].filter(Boolean);

  for (const candidate of candidates) {
    const card = cardsSnapshot.find((entry) => namesMatch(entry.assetName, candidate));

    if (card) {
      return card;
    }
  }

  return undefined;
};

const resolvePreferenceForFile = (
  file: File,
  parsed: Record<string, unknown>,
  index: number,
  batchSize: number
): AssetOptimizationPreference => {
  const committed = findCommittedPreference(file, parsed);
  if (committed) {
    assetPreferencesByFileKey.set(
      buildFileKey(file.name, file.size, file.lastModified),
      committed
    );
    return committed;
  }

  const card = findCardForFile(file, parsed, index, batchSize);

  if (card) {
    const byCard = assetPreferencesById.get(card.assetId);

    if (byCard) {
      assetPreferencesByFileKey.set(
        buildFileKey(file.name, file.size, file.lastModified),
        byCard
      );
      return byCard;
    }
  }

  const name = String(parsed.name ?? file.name);
  const fileKey = buildFileKey(name, file.size, file.lastModified);

  const byFileKey = assetPreferencesByFileKey.get(fileKey);
  if (byFileKey) {
    return byFileKey;
  }

  const assetId = parsed.optimizerAssetId;
  if (typeof assetId === 'string') {
    const byId = assetPreferencesById.get(assetId);
    if (byId) {
      assetPreferencesByFileKey.set(fileKey, byId);
      return byId;
    }
  }

  const byName = findPreferenceByAssetName(name, file);
  if (byName) {
    return byName;
  }

  if (parsed.optimizationChoice) {
    return {
      choice: parsed.optimizationChoice as OptimizationChoice,
      custom: parsed.optimizationCustom as OptimizationSettings | undefined,
    };
  }

  return createDefaultPreference();
};

const buildFileInfoPayload = (
  parsed: Record<string, unknown>,
  preference: AssetOptimizationPreference
) => {
  const payload: Record<string, unknown> = {
    ...parsed,
    optimizationChoice: preference.choice,
  };

  if (preference.choice === 'custom' && preference.custom) {
    payload.optimizationCustom = preference.custom;
  } else {
    delete payload.optimizationCustom;
  }

  return payload;
};

const formDataHasVideo = (formData: FormData) => {
  let hasVideo = false;

  formData.forEach((value, key) => {
    if (key === 'files' && value instanceof File && isVideoFileName(value.name)) {
      hasVideo = true;
    }
  });

  return hasVideo;
};

const isMediaUploadRequest = (url: string, method?: string) => {
  if (method?.toUpperCase() !== 'POST') {
    return false;
  }

  try {
    const pathname = new URL(url, window.location.origin).pathname.replace(/\/+$/, '') || '/';

    return (
      pathname === '/upload' ||
      pathname === '/upload/unstable/upload-file' ||
      pathname.endsWith('/upload/unstable/upload-file')
    );
  } catch {
    return (
      url.includes('/upload/unstable/upload-file') ||
      (url.includes('/upload') && !url.includes('/upload/actions/'))
    );
  }
};

const buildOptimizedFormData = (sourceFormData: FormData) => {
  const nextFormData = new FormData();
  const files: File[] = [];
  const fileInfos: string[] = [];

  sourceFormData.forEach((value, key) => {
    if (key === 'files' && value instanceof File) {
      files.push(value);
    } else if (key === 'fileInfo' && typeof value === 'string') {
      fileInfos.push(value);
    }
  });

  const preferencesPayload: Array<{
    assetId?: string;
    fileName: string;
    preference: AssetOptimizationPreference;
  }> = [];

  files.forEach((file, index) => {
    nextFormData.append('files', file);

    const parsed = JSON.parse(fileInfos[index] ?? '{}') as Record<string, unknown>;
    const card = findCardForFile(file, parsed, index, files.length);

    let assetId = parsed.optimizerAssetId as string | undefined;
    if (!assetId && card) {
      assetId = card.assetId;
    }

    if (!assetId) {
      const name = String(parsed.name ?? file.name);
      assetId =
        committedAssetIdByName.get(normalizeName(name)) ??
        committedAssetIdByName.get(normalizeName(file.name));

      if (!assetId) {
        for (const [id, assetName] of assetNamesById.entries()) {
          if (namesMatch(assetName, name) || namesMatch(assetName, file.name)) {
            assetId = id;
            break;
          }
        }
      }
    }

    if (assetId) {
      parsed.optimizerAssetId = assetId;
    }

    const preference = resolvePreferenceForFile(file, parsed, index, files.length);

    preferencesPayload.push({
      assetId,
      fileName: file.name,
      preference,
    });

    nextFormData.append('fileInfo', JSON.stringify(buildFileInfoPayload(parsed, preference)));
  });

  nextFormData.append('videoOptimizerPreferences', JSON.stringify(preferencesPayload));
  nextFormData.append('videoOptimizerBuildMarker', PLUGIN_BUILD_MARKER);

  if (typeof window !== 'undefined') {
    console.info(
      `[video-optimizer] Upload payload patched (${PLUGIN_BUILD_MARKER})`,
      preferencesPayload.map((entry) => ({
        fileName: entry.fileName,
        choice: entry.preference.choice,
        format:
          entry.preference.choice === 'custom'
            ? entry.preference.custom?.defaultFormat
            : entry.preference.choice,
      }))
    );
  }

  sourceFormData.forEach((value, key) => {
    if (key !== 'files' && key !== 'fileInfo') {
      nextFormData.append(key, value);
    }
  });

  files.forEach((file) => {
    committedPreferencesByName.delete(normalizeName(file.name));
  });
  preferencesPayload.forEach((entry) => {
    if (entry.assetId) {
      committedPreferencesByAssetId.delete(entry.assetId);
    }
    committedPreferencesByName.delete(normalizeName(entry.fileName));
  });

  return nextFormData;
};

export const patchUploadFetch = () => {
  if (fetchPatched || typeof window === 'undefined') {
    return;
  }

  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? request?.method;
    const body = init?.body ?? request?.body;

    if (isMediaUploadRequest(url, method) && body instanceof FormData) {
      const hasVideo = formDataHasVideo(body);
      const response = await originalFetch(input, {
        ...init,
        method: method ?? init?.method ?? 'POST',
        body: buildOptimizedFormData(body),
      });

      if (hasVideo && response.ok) {
        wakeJobPoller();
      }

      return response;
    }

    return originalFetch(input, init);
  };
};

export const patchUploadXHR = () => {
  if (xhrPatched || typeof window === 'undefined' || typeof XMLHttpRequest === 'undefined') {
    return;
  }

  xhrPatched = true;

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    (this as XMLHttpRequest & { _optimizerMethod?: string; _optimizerUrl?: string })._optimizerMethod =
      method;
    (this as XMLHttpRequest & { _optimizerMethod?: string; _optimizerUrl?: string })._optimizerUrl =
      typeof url === 'string' ? url : url.toString();
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    const request = this as XMLHttpRequest & {
      _optimizerMethod?: string;
      _optimizerUrl?: string;
    };

    if (
      body instanceof FormData &&
      isMediaUploadRequest(request._optimizerUrl ?? '', request._optimizerMethod)
    ) {
      const optimizedBody = buildOptimizedFormData(body);
      const hasVideo = formDataHasVideo(body);

      if (hasVideo) {
        this.addEventListener(
          'load',
          () => {
            if (this.status >= 200 && this.status < 300) {
              wakeJobPoller();
            }
          },
          { once: true }
        );
      }

      return originalSend.call(this, optimizedBody);
    }

    return originalSend.call(this, body as XMLHttpRequestBodyInit | null | undefined);
  };
};

export const isPreferenceCustomized = (assetId: string) => {
  const current = getAssetPreference(assetId);
  const defaults = createDefaultPreference();

  return JSON.stringify(current) !== JSON.stringify(defaults);
};
