import React, { useSyncExternalStore } from 'react';
import { DesignSystemProvider, darkTheme, lightTheme } from '@strapi/design-system';
import { IntlProvider } from 'react-intl';
import { UploadEnhancerBridge } from './UploadEnhancerBridge';
import { MediaLibraryProgressBridge } from './MediaLibraryProgressBridge';
import { MediaLibraryCardActionsBridge } from './MediaLibraryCardActionsBridge';
import { PLUGIN_ID } from '../pluginId';
import {
  getEditingAssetId,
  subscribeUploadAssets,
} from '../utils/uploadAssetStore';

const THEME_KEY = 'STRAPI_THEME';

const enMessages: Record<string, string> = {
  [`${PLUGIN_ID}.upload.button.label`]: 'Optimization settings',
  [`${PLUGIN_ID}.upload.modal.title`]: 'Video optimization',
  [`${PLUGIN_ID}.upload.modal.save`]: 'Save',
  [`${PLUGIN_ID}.upload.modal.cancel`]: 'Cancel',
  [`${PLUGIN_ID}.settings.format.mp4`]: 'MP4 (H.264)',
  [`${PLUGIN_ID}.settings.format.webm`]: 'WebM (VP9)',
  [`${PLUGIN_ID}.choice.original`]: 'Keep original',
  [`${PLUGIN_ID}.choice.original.description`]:
    'No optimization is applied. The file is uploaded exactly as selected.',
  [`${PLUGIN_ID}.choice.global`]: 'Apply global settings',
  [`${PLUGIN_ID}.choice.global.description`]:
    'Uses the global optimization profile configured in Settings.',
  [`${PLUGIN_ID}.choice.custom`]: 'Custom',
  [`${PLUGIN_ID}.choice.custom.description`]:
    'Configure format and quality settings specifically for this video.',
  [`${PLUGIN_ID}.optimization.warning.title`]: 'This video may already be well optimized',
  [`${PLUGIN_ID}.optimization.warning.description`]:
    'Re-encoding may not reduce file size and can even make it larger. Consider Keep original, or raise CRF / lower resolution if you need a smaller output.',
  [`${PLUGIN_ID}.settings.global.defaultFormat`]: 'Output format',
  [`${PLUGIN_ID}.settings.global.videoCodec`]: 'Video codec',
  [`${PLUGIN_ID}.settings.global.crf`]: 'CRF (quality)',
  [`${PLUGIN_ID}.settings.global.preset`]: 'Encode preset',
  [`${PLUGIN_ID}.settings.global.audioMode`]: 'Audio handling',
  [`${PLUGIN_ID}.settings.global.audioBitrate`]: 'Audio bitrate',
  [`${PLUGIN_ID}.settings.resize.title`]: 'Output dimensions',
  [`${PLUGIN_ID}.settings.resize.width`]: 'Max width (px)',
  [`${PLUGIN_ID}.settings.resize.height`]: 'Max height (px)',
  [`${PLUGIN_ID}.settings.resize.hint`]:
    'Video is scaled down if larger than these limits while preserving aspect ratio.',
  [`${PLUGIN_ID}.upload.mode.footer.global`]: 'Global: {mode}',
  [`${PLUGIN_ID}.upload.mode.footer.custom`]: 'Custom: {mode}',
  [`${PLUGIN_ID}.jobs.status.queued`]: 'Queued',
  [`${PLUGIN_ID}.jobs.status.processing`]: 'Processing',
  [`${PLUGIN_ID}.jobs.status.completed`]: 'Completed',
  [`${PLUGIN_ID}.jobs.status.failed`]: 'Failed',
  [`${PLUGIN_ID}.jobs.stage.encoding`]: 'Encoding video',
  [`${PLUGIN_ID}.jobs.stage.finalizing`]: 'Finalizing',
  [`${PLUGIN_ID}.jobs.stage.preparing`]: 'Preparing',
  [`${PLUGIN_ID}.jobs.stage.queued`]: 'Waiting in queue',
  [`${PLUGIN_ID}.jobs.card.progress`]: 'Optimizing: {progress}% → {format}',
  [`${PLUGIN_ID}.jobs.card.queued`]: 'In queue',
  [`${PLUGIN_ID}.mediaLibrary.button.optimize`]: 'Optimize video',
  [`${PLUGIN_ID}.mediaLibrary.button.cancel`]: 'Cancel optimization',
  [`${PLUGIN_ID}.mediaLibrary.modal.title`]: 'Video optimization',
  [`${PLUGIN_ID}.mediaLibrary.modal.start`]: 'Start optimization',
};

const getTheme = () => {
  const stored = localStorage.getItem(THEME_KEY);

  if (stored === 'dark') {
    return darkTheme;
  }

  if (stored === 'system' || !stored) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme;
  }

  return lightTheme;
};

export const BridgeProviders = ({ children }: { children: React.ReactNode }) => {
  const editingAssetId = useSyncExternalStore(subscribeUploadAssets, getEditingAssetId);
  const [theme, setTheme] = React.useState(getTheme);

  React.useEffect(() => {
    setTheme(getTheme());
  }, [editingAssetId]);

  React.useEffect(() => {
    const syncTheme = () => setTheme(getTheme());
    window.addEventListener('storage', syncTheme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', syncTheme);

    const themeSyncTimer = window.setInterval(() => {
      setTheme((current) => {
        const next = getTheme();
        return current === next ? current : next;
      });
    }, 1000);

    return () => {
      window.removeEventListener('storage', syncTheme);
      media.removeEventListener('change', syncTheme);
      window.clearInterval(themeSyncTimer);
    };
  }, []);

  return (
    <IntlProvider locale="en" messages={enMessages} defaultLocale="en">
      <DesignSystemProvider locale="en-GB" theme={theme}>
        {children}
      </DesignSystemProvider>
    </IntlProvider>
  );
};

export const UploadEnhancerRoot = () => (
  <BridgeProviders>
    <UploadEnhancerBridge />
  </BridgeProviders>
);

export const MediaLibraryProgressRoot = () => (
  <BridgeProviders>
    <MediaLibraryProgressBridge />
    <MediaLibraryCardActionsBridge />
  </BridgeProviders>
);
