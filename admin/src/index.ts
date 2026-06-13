import { getTranslationKey, PLUGIN_ID } from './pluginId';
import { MediaLibraryCacheBridge } from './components/MediaLibraryCacheBridge';
import {
  registerMediaLibraryDispatch,
} from './utils/invalidateMediaLibrary';
import { initUploadEnhancer } from './utils/initUploadEnhancer';
import { initMediaLibraryProgress } from './utils/initMediaLibraryProgress';
import { initMediaLibraryCardActions } from './utils/initMediaLibraryCardActions';
import { initJobPoller } from './utils/initJobPoller';
import { installQueryClientCapture } from './utils/captureQueryClient';
import { installDebugMediaLibraryProgress } from './utils/debugMediaLibraryProgress';
import { patchUploadFetch, patchUploadXHR } from './utils/uploadAssetStore';

const prefixPluginTranslations = (
  trad: Record<string, string>,
  pluginId: string
): Record<string, string> => {
  return Object.entries(trad).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[`${pluginId}.${key}`] = value;
    return acc;
  }, {});
};

export default {
  register(app) {
    app.addSettingsLink('global', {
      id: 'video-optimizer',
      to: 'video-optimizer',
      intlLabel: {
        id: getTranslationKey('settings.section-label'),
        defaultMessage: 'Video Optimizer',
      },
      Component: () =>
        import('./pages/SettingsPage').then((mod) => ({
          default: mod.ProtectedSettingsPage,
        })),
      permissions: [],
    });

    app.addComponents([
      {
        name: 'future-global::video-optimizer-cache',
        Component: MediaLibraryCacheBridge,
      },
    ]);

    app.addMiddlewares([
      () => (api) => {
        registerMediaLibraryDispatch(api.dispatch);

        return (next) => (action) => next(action);
      },
    ]);
  },

  bootstrap() {
    patchUploadFetch();
    patchUploadXHR();
    installQueryClientCapture();
    initUploadEnhancer();
    initMediaLibraryProgress();
    initMediaLibraryCardActions();
    initJobPoller();
    installDebugMediaLibraryProgress();
  },

  async registerTrads({ locales }: { locales: string[] }) {
    const importedTrads = await Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return {
            data: prefixPluginTranslations(data, PLUGIN_ID),
            locale,
          };
        } catch {
          return { data: {}, locale };
        }
      })
    );

    return importedTrads;
  },
};
