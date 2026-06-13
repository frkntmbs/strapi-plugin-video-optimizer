import { registerMediaLibraryQueryClient } from './invalidateMediaLibrary';
import { registerMediaLibraryQueryClientBridge } from './mediaLibraryQueryBridge';

let installed = false;

export const installQueryClientCapture = () => {
  if (installed || typeof window === 'undefined') {
    return;
  }

  installed = true;

  void import('react-query')
    .then((reactQuery) => {
      const original = reactQuery.useQueryClient;

      if ((original as { __videoOptimizerPatched?: boolean }).__videoOptimizerPatched) {
        return;
      }

      const patched = () => {
        const client = original();
        registerMediaLibraryQueryClientBridge(client);
        registerMediaLibraryQueryClient(client);
        return client;
      };

      (patched as { __videoOptimizerPatched?: boolean }).__videoOptimizerPatched = true;
      Object.assign(reactQuery, { useQueryClient: patched });
    })
    .catch(() => {
      installed = false;
    });
};
