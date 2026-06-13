import { AsyncLocalStorage } from 'async_hooks';

interface UploadRequestContext {
  userId?: number;
}

export const uploadContext = new AsyncLocalStorage<UploadRequestContext>();
