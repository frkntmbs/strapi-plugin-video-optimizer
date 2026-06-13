import type { QueryClient } from 'react-query';
import { adminGet } from './adminFetch';

const UPLOAD_PLUGIN_ID = 'upload';

export interface UploadAssetRecord {
  id: number;
  name?: string;
  hash?: string;
  url?: string;
  mime?: string;
  ext?: string;
}

let queryClientRef: QueryClient | null = null;
let fetchedAssets: UploadAssetRecord[] = [];
let fetchPromise: Promise<UploadAssetRecord[]> | null = null;

export const registerMediaLibraryQueryClientBridge = (queryClient: QueryClient | null) => {
  queryClientRef = queryClient;
};

export const getMediaLibraryQueryClient = () => queryClientRef;

const readAssetsFromQueryCache = (): UploadAssetRecord[] => {
  if (!queryClientRef) {
    return [];
  }

  for (const query of queryClientRef.getQueryCache().findAll([UPLOAD_PLUGIN_ID, 'assets'])) {
    const data = query.state.data as { results?: UploadAssetRecord[] } | undefined;

    if (Array.isArray(data?.results)) {
      return data.results;
    }
  }

  return [];
};

const readAssetsFromUploadApi = async (): Promise<UploadAssetRecord[]> => {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') ?? '1';
  const pageSize = params.get('pageSize') ?? '10';
  const sort = params.get('sort') ?? 'createdAt:DESC';

  const data = await adminGet<UploadAssetRecord[] | { results?: UploadAssetRecord[] }>(
    `/upload/files?sort=${encodeURIComponent(sort)}&page=${page}&pageSize=${pageSize}`
  );

  if (Array.isArray(data)) {
    return data;
  }

  return data?.results ?? [];
};

export const getUploadAssetsFromCache = (): UploadAssetRecord[] => {
  const fromQuery = readAssetsFromQueryCache();

  if (fromQuery.length) {
    return fromQuery;
  }

  return fetchedAssets;
};

export const ensureUploadAssets = async (): Promise<UploadAssetRecord[]> => {
  const fromQuery = readAssetsFromQueryCache();

  if (fromQuery.length) {
    fetchedAssets = fromQuery;
    return fromQuery;
  }

  if (fetchedAssets.length) {
    return fetchedAssets;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      fetchedAssets = await readAssetsFromUploadApi();
      return fetchedAssets;
    } catch {
      return fetchedAssets;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
};

export const invalidateFetchedUploadAssets = () => {
  fetchedAssets = [];
  fetchPromise = null;
};
