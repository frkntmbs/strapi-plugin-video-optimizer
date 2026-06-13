import { AsyncLocalStorage } from 'async_hooks';
import type { OptimizationChoice, OptimizationSettings } from '../constants';

export interface UploadFilePreference {
  assetId?: string;
  fileName: string;
  preference: {
    choice: OptimizationChoice;
    custom?: OptimizationSettings;
  };
}

interface OptimizerUploadContext {
  preferences: UploadFilePreference[];
  nextIndex: number;
}

export const optimizerUploadContext = new AsyncLocalStorage<OptimizerUploadContext>();

let fallbackContext: OptimizerUploadContext | null = null;

let batchPreferences: UploadFilePreference[] | null = null;

export const registerUploadBatchPreferences = (preferences: UploadFilePreference[]) => {
  batchPreferences = preferences;
};

export const clearUploadBatchPreferences = () => {
  batchPreferences = null;
};

const normalizeFileName = (value: string) => value.trim().toLowerCase();

export const resolveUploadBatchPreference = (fileName: string, assetId?: string) => {
  if (!batchPreferences?.length) {
    return null;
  }

  const normalizedTarget = normalizeFileName(fileName);

  const match = batchPreferences.find((entry) => {
    if (assetId && entry.assetId === assetId) {
      return true;
    }

    return normalizeFileName(entry.fileName) === normalizedTarget;
  });

  return match?.preference ?? null;
};

export const createUploadContext = (preferences: UploadFilePreference[]): OptimizerUploadContext => ({
  preferences,
  nextIndex: 0,
});

export const setFallbackUploadPreferences = (preferences: UploadFilePreference[]) => {
  fallbackContext = createUploadContext(preferences);
};

export const clearFallbackUploadPreferences = () => {
  fallbackContext = null;
};

const getActivePreferences = () => {
  const store = optimizerUploadContext.getStore();

  if (store?.preferences.length) {
    return store;
  }

  return fallbackContext;
};

export const parseUploadPreferences = (body: Record<string, unknown> | undefined) => {
  const raw = body?.videoOptimizerPreferences;

  if (!raw) {
    return [] as UploadFilePreference[];
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as UploadFilePreference[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(raw) ? (raw as UploadFilePreference[]) : [];
};

export const findUploadPreference = (fileName: string, assetId?: string) => {
  const store = getActivePreferences();

  if (!store) {
    return null;
  }

  const match = store.preferences.find((entry) => {
    if (assetId && entry.assetId === assetId) {
      return true;
    }

    return entry.fileName === fileName;
  });

  return match?.preference ?? null;
};

export const consumeUploadPreference = (fileName: string, assetId?: string) => {
  const batchPreference = resolveUploadBatchPreference(fileName, assetId);

  if (batchPreference) {
    return batchPreference;
  }

  const store = getActivePreferences();

  if (!store) {
    return null;
  }

  const matched = store.preferences.find((entry) => {
    if (assetId && entry.assetId === assetId) {
      return true;
    }

    return normalizeFileName(entry.fileName) === normalizeFileName(fileName);
  });

  if (matched) {
    return matched.preference;
  }

  const indexed = store.preferences[store.nextIndex];

  if (indexed) {
    store.nextIndex += 1;
    return indexed.preference;
  }

  return null;
};

const UPLOAD_ROUTE_SUFFIXES = ['/upload', '/upload/unstable/upload-file'];

export const isUploadRoute = (method: string, path: string) => {
  if (method.toUpperCase() !== 'POST') {
    return false;
  }

  const normalizedPath = path.replace(/\/+$/, '') || '/';

  return UPLOAD_ROUTE_SUFFIXES.some(
    (suffix) => normalizedPath === suffix || normalizedPath.endsWith(suffix)
  );
};

interface StashedPreference {
  choice: OptimizationChoice;
  custom?: OptimizationSettings;
}

const pendingPreferencesByKey = new Map<string, StashedPreference>();

const buildPreferenceKey = (fileName: string, assetId?: string) =>
  assetId ? `asset:${assetId}` : `file:${fileName}`;

export const stashUploadPreference = (
  fileName: string,
  assetId: string | undefined,
  preference: StashedPreference
) => {
  pendingPreferencesByKey.set(buildPreferenceKey(fileName, assetId), preference);

  if (assetId) {
    pendingPreferencesByKey.set(buildPreferenceKey(fileName), preference);
  }

  pendingPreferencesByKey.set(`file:${fileName}`, preference);
};

export const takePendingPreference = (fileName: string, assetId?: string) => {
  const keys = [
    assetId ? buildPreferenceKey(fileName, assetId) : null,
    buildPreferenceKey(fileName),
    `file:${fileName}`,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const preference = pendingPreferencesByKey.get(key);

    if (preference) {
      pendingPreferencesByKey.delete(key);
      return preference;
    }
  }

  return null;
};
