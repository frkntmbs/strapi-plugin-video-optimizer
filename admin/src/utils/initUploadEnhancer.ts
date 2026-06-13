import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { UploadEnhancerRoot } from '../components/BridgeProviders';
import { mergeGlobalSettings } from '../defaultGlobalSettings';
import type { GlobalOptimizationSettings } from '../pluginId';
import { patchUploadFetch, patchUploadXHR } from './uploadAssetStore';
import {
  clearUploadSession,
  getEditingAssetId,
  registerAsset,
  setGlobalSettings,
  setUploadAssetCards,
  setUploadDialogElement,
  updateAssetDimensions,
  type UploadAssetEntry,
} from './uploadAssetStore';
import { isVideoFileName } from '../pluginId';
import { extractAssetDimensions } from './extractAssetDimensions';
import {
  ensureVideoElementDimensions,
  findUploadFilesInDialog,
  matchUploadFile,
  probeVideoFileDimensions,
} from './probeVideoDimensions';

const pendingDimensionProbes = new Set<string>();

let bridgeRoot: Root | null = null;
let bridgeHost: HTMLElement | null = null;
let mountedDialog: Element | null = null;
let started = false;

const VIDEO_EXT_PATTERN =
  /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i;

const getAuthToken = (): string | null => {
  const fromStorage = localStorage.getItem('jwtToken');
  if (fromStorage) {
    try {
      return JSON.parse(fromStorage) as string;
    } catch {
      return null;
    }
  }

  const match = document.cookie.match(/(?:^|;\s*)jwtToken=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const loadGlobalSettings = async () => {
  try {
    const backendURL = window.strapi?.backendURL;
    if (!backendURL) {
      return;
    }

    const token = getAuthToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${backendURL}/video-optimizer/default-mode`, { headers });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as Partial<GlobalOptimizationSettings>;

    setGlobalSettings(mergeGlobalSettings(data));
  } catch {
    // Keep fallback defaults.
  }
};

const getButtonLabel = (btn: Element) => {
  const aria = btn.getAttribute('aria-label') ?? '';
  const text = btn.textContent ?? '';
  const title = btn.getAttribute('title') ?? '';

  return `${aria} ${text} ${title}`.toLowerCase();
};

const isActionButtonLabel = (btn: Element, keywords: string[]) => {
  const label = getButtonLabel(btn);
  return keywords.some((keyword) => label.includes(keyword));
};

const isUploadPendingModal = (root: Element) => {
  const text = root.textContent?.toLowerCase() ?? '';

  if (
    text.includes('ready to upload') ||
    text.includes('yüklenmeye hazır') ||
    text.includes('manage the assets before adding') ||
    text.includes('medya kütüphanesine eklemeden önce')
  ) {
    return true;
  }

  const hasVideoAsset = VIDEO_EXT_PATTERN.test(text);
  const hasEditButton = [...root.querySelectorAll('button')].some((btn) =>
    isActionButtonLabel(btn, ['edit', 'düzenle'])
  );

  return hasVideoAsset && hasEditButton;
};

const isLikelyVideoCard = (card: Element) => {
  const text = card.textContent?.toLowerCase() ?? '';
  return (
    VIDEO_EXT_PATTERN.test(text) ||
    /\b(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)\b/.test(text) ||
    text.includes('video') ||
    text.includes('video')
  );
};

const isOptimizerMutationNode = (node: Node): boolean => {
  if (!(node instanceof Element)) {
    return false;
  }

  return Boolean(
    node.id === 'video-optimizer-upload-bridge' ||
    node.closest('#video-optimizer-upload-bridge, [data-optimizer-action-host], [data-optimizer-footer-host]')
  );
};

const shouldSyncForMutations = (mutations: MutationRecord[]) => {
  return mutations.some((mutation) => {
    if (isOptimizerMutationNode(mutation.target)) {
      return false;
    }

    if (mutation.type === 'attributes' && isOptimizerMutationNode(mutation.target)) {
      return false;
    }

    for (const node of mutation.addedNodes) {
      if (!isOptimizerMutationNode(node)) {
        return true;
      }
    }

    for (const node of mutation.removedNodes) {
      if (!isOptimizerMutationNode(node)) {
        return true;
      }
    }

    return mutation.type === 'characterData';
  });
};

const extractAssetName = (card: Element) => {
  const titleEl = card.querySelector('h2, [class*="CardTitle"]');
  const titleText = titleEl?.textContent?.trim() ?? '';

  if (titleText && isVideoFileName(titleText)) {
    return titleText.match(/[\w.-]+\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i)?.[0] ?? titleText;
  }

  const cardText = card.textContent ?? '';
  const dottedMatch = cardText.match(/[\w.-]+\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv|flv|3gp)/i);
  if (dottedMatch) {
    return dottedMatch[0];
  }

  const subtitleEl = card.querySelector('[class*="CardSubtitle"]');
  const subtitleText = subtitleEl?.textContent?.trim() ?? '';
  const extOnly = subtitleText.match(/^([a-z0-9]+)/i)?.[1]?.toLowerCase();

  if (titleText && extOnly) {
    if (titleText.toLowerCase().endsWith(`.${extOnly}`)) {
      return titleText;
    }

    return `${titleText}.${extOnly}`;
  }

  return titleText || null;
};

const findCardRoot = (editButton: Element, dialog: Element) => {
  let element = editButton.parentElement;

  while (element && element !== dialog) {
    if (element.getAttribute('role') === 'button') {
      return element;
    }

    if (element.tagName === 'ARTICLE' || element.querySelector('h2, [class*="CardTitle"]')) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
};

const findUploadDialog = () => {
  const candidates = [
    ...document.querySelectorAll('[role="dialog"]'),
    ...document.querySelectorAll('[aria-modal="true"]'),
  ];

  return candidates.find(isUploadPendingModal) ?? null;
};

const cleanupEnhancerDom = () => {
  document.querySelectorAll('[data-optimizer-footer-host]').forEach((el) => el.remove());
  document.querySelectorAll('[data-optimizer-action-host]').forEach((el) => el.remove());
};

const unmountBridge = () => {
  bridgeRoot?.unmount();
  bridgeRoot = null;
  bridgeHost?.remove();
  bridgeHost = null;
  mountedDialog = null;
  cleanupEnhancerDom();
  setUploadDialogElement(null);
  setUploadAssetCards([]);
};

const ensureBridge = (dialog: Element) => {
  if (mountedDialog === dialog && bridgeRoot) {
    return;
  }

  if (getEditingAssetId()) {
    return;
  }

  unmountBridge();
  mountedDialog = dialog;

  const dialogElement = dialog as HTMLElement;
  if (getComputedStyle(dialogElement).position === 'static') {
    dialogElement.style.position = 'relative';
  }

  setUploadDialogElement(dialogElement);

  bridgeHost = document.createElement('div');
  bridgeHost.id = 'video-optimizer-upload-bridge';
  bridgeHost.style.cssText = 'display:none;';
  dialog.appendChild(bridgeHost);

  bridgeRoot = createRoot(bridgeHost);
  bridgeRoot.render(React.createElement(UploadEnhancerRoot));
};

const ensureActionHost = (actionsContainer: HTMLElement, editButton: Element, assetId: string) => {
  const selector = `[data-optimizer-action-host="${assetId}"]`;
  let actionHost = actionsContainer.querySelector(selector) as HTMLElement | null;

  if (!actionHost) {
    actionHost = document.createElement('span');
    actionHost.dataset.optimizerActionHost = assetId;
    editButton.insertAdjacentElement('afterend', actionHost);
  }

  actionHost.style.cssText = 'display:contents;';

  return actionHost;
};

const ensureFooterHost = (cardElement: HTMLElement, assetId: string) => {
  const parent = cardElement.parentElement;

  if (!parent) {
    return null;
  }

  const selector = `[data-optimizer-footer-host="${assetId}"]`;
  let footerHost = parent.querySelector(selector) as HTMLElement | null;

  if (!footerHost) {
    footerHost = document.createElement('div');
    footerHost.dataset.optimizerFooterHost = assetId;
    parent.appendChild(footerHost);
  }

  return footerHost;
};

const queueDimensionProbe = (
  dialog: Element,
  assetId: string,
  assetName: string,
  card: Element
) => {
  if (pendingDimensionProbes.has(assetId)) {
    return;
  }

  pendingDimensionProbes.add(assetId);

  void (async () => {
    try {
      let dimensions = extractAssetDimensions(card);

      if (!dimensions) {
        dimensions = await ensureVideoElementDimensions(card);
      }

      if (!dimensions) {
        const files = findUploadFilesInDialog(dialog);
        const file = matchUploadFile(files, assetName);

        if (file) {
          dimensions = await probeVideoFileDimensions(file);
        }
      }

      if (dimensions) {
        updateAssetDimensions(assetId, dimensions);
      }
    } finally {
      pendingDimensionProbes.delete(assetId);
    }
  })();
};

const collectCards = (dialog: Element): UploadAssetEntry[] => {
  const entries: UploadAssetEntry[] = [];
  const seenCards = new Set<Element>();

  dialog.querySelectorAll('button').forEach((button) => {
    if (isActionButtonLabel(button, ['optimization', 'optimizasyon'])) {
      return;
    }

    if (!isActionButtonLabel(button, ['edit', 'düzenle'])) {
      return;
    }

    const card = findCardRoot(button, dialog);
    if (!card || seenCards.has(card)) {
      return;
    }

    seenCards.add(card);

    if (!isLikelyVideoCard(card)) {
      return;
    }

    const actionsContainer = button.parentElement as HTMLElement | null;
    if (!actionsContainer) {
      return;
    }

    const assetName = extractAssetName(card);
    if (!assetName) {
      return;
    }

    let assetId = card.getAttribute('data-optimizer-asset-id');
    if (!assetId) {
      assetId = crypto.randomUUID();
      card.setAttribute('data-optimizer-asset-id', assetId);
    }

    const dimensions = extractAssetDimensions(card);

    registerAsset(assetId, assetName, dimensions);

    if (!dimensions) {
      queueDimensionProbe(dialog, assetId, assetName, card);
    }

    entries.push({
      assetId,
      assetName,
      width: dimensions?.width,
      height: dimensions?.height,
      actionsContainer: ensureActionHost(actionsContainer, button, assetId),
      footerHost: ensureFooterHost(card as HTMLElement, assetId) ?? undefined,
    });
  });

  return entries;
};

const syncUploadModal = () => {
  const dialog = findUploadDialog();

  if (!dialog) {
    if (getEditingAssetId()) {
      return;
    }

    clearUploadSession();
    unmountBridge();
    return;
  }

  ensureBridge(dialog);
  setUploadAssetCards(collectCards(dialog));
};

let syncScheduled = false;

const scheduleSyncUploadModal = () => {
  if (syncScheduled) {
    return;
  }

  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncUploadModal();
  });
};

export const initUploadEnhancer = () => {
  if (started || typeof window === 'undefined') {
    return;
  }

  started = true;
  patchUploadFetch();
  patchUploadXHR();

  const boot = () => {
    loadGlobalSettings();
    syncUploadModal();

    const observer = new MutationObserver((mutations) => {
      if (shouldSyncForMutations(mutations)) {
        scheduleSyncUploadModal();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
};
