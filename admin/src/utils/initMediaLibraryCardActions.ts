import {
  collectVideoCards,
  isVideoAssetCard,
  prepareCardsForMatching,
  resolveFileIdForCard,
} from './mediaLibraryCardMatch';
import { setMediaLibraryCards, type MediaLibraryCardEntry } from './mediaLibraryCardStore';
import { ensureUploadAssets, type UploadAssetRecord } from './mediaLibraryQueryBridge';
import { isMediaLibraryPath } from './mediaLibraryRoute';
import { extractAssetDimensions } from './extractAssetDimensions';

let domObserver: MutationObserver | null = null;
let domObserverTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let syncInFlight = false;

const isMediaLibraryRoute = () => isMediaLibraryPath(window.location.pathname);

const getButtonLabel = (button: Element) => {
  const aria = button.getAttribute('aria-label') ?? '';
  const text = button.textContent ?? '';
  const title = button.getAttribute('title') ?? '';

  return `${aria} ${text} ${title}`.toLowerCase();
};

const isEditButton = (button: Element) => {
  const label = getButtonLabel(button);

  return label.includes('edit') || label.includes('düzenle');
};

const isPluginActionButton = (button: Element) => {
  const label = getButtonLabel(button);

  return (
    label.includes('optimization') ||
    label.includes('optimizasyon') ||
    label.includes('cancel optimization') ||
    label.includes('optimizasyonu iptal')
  );
};

const isInsideDialog = (element: Element) =>
  Boolean(element.closest('[role="dialog"], [aria-modal="true"]'));

const isPluginMutationNode = (node: Node) => {
  if (!(node instanceof Element)) {
    return false;
  }

  return Boolean(
    node.id === 'video-optimizer-media-library-card-actions' ||
      node.closest(
        '#video-optimizer-media-library-card-actions, [data-video-optimizer-ml-optimize-host], [data-video-optimizer-ml-cancel-host]'
      )
  );
};

const shouldSyncForMutations = (mutations: MutationRecord[]) =>
  mutations.some((mutation) => {
    if (isPluginMutationNode(mutation.target)) {
      return false;
    }

    for (const node of mutation.addedNodes) {
      if (!isPluginMutationNode(node)) {
        return true;
      }
    }

    for (const node of mutation.removedNodes) {
      if (!isPluginMutationNode(node)) {
        return true;
      }
    }

    return mutation.type === 'characterData';
  });

const findCardRoot = (button: Element) => {
  let element = button.parentElement;
  const root = document.querySelector('main') ?? document.body;

  while (element && element !== root) {
    if (element.getAttribute('role') === 'button') {
      return element;
    }

    if (element.tagName === 'ARTICLE' || element.querySelector('[id$="-title"], h2')) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
};

const ensureHost = (
  actionsContainer: HTMLElement,
  afterElement: Element,
  attribute: 'data-video-optimizer-ml-optimize-host' | 'data-video-optimizer-ml-cancel-host',
  fileId: number
) => {
  const selector = `[${attribute}="${fileId}"]`;
  let host = actionsContainer.querySelector(selector) as HTMLElement | null;

  if (!host) {
    host = document.createElement('span');
    host.setAttribute(attribute, String(fileId));
    afterElement.insertAdjacentElement('afterend', host);
  }

  host.style.cssText = 'display:contents;';

  return host;
};

const cleanupCardActionHosts = (activeFileIds: Set<number>) => {
  for (const host of document.querySelectorAll('[data-video-optimizer-ml-optimize-host]')) {
    const fileId = Number(host.getAttribute('data-video-optimizer-ml-optimize-host'));

    if (!activeFileIds.has(fileId)) {
      host.remove();
    }
  }

  for (const host of document.querySelectorAll('[data-video-optimizer-ml-cancel-host]')) {
    const fileId = Number(host.getAttribute('data-video-optimizer-ml-cancel-host'));

    if (!activeFileIds.has(fileId)) {
      host.remove();
    }
  }
};

const collectCardActions = (uploadAssets: UploadAssetRecord[]): MediaLibraryCardEntry[] => {
  if (!isMediaLibraryRoute()) {
    return [];
  }

  const cards = collectVideoCards();
  prepareCardsForMatching(cards);
  const entries: MediaLibraryCardEntry[] = [];
  const seenCards = new Set<Element>();
  const seenFileIds = new Set<number>();
  const root = document.querySelector('main') ?? document.body;

  root.querySelectorAll('button').forEach((button) => {
    if (isInsideDialog(button) || !isEditButton(button) || isPluginActionButton(button)) {
      return;
    }

    const card = findCardRoot(button);

    if (!card || seenCards.has(card) || !isVideoAssetCard(card)) {
      return;
    }

    const fileId = resolveFileIdForCard(card, uploadAssets);

    if (!fileId || seenFileIds.has(fileId)) {
      return;
    }

    const actionsContainer = button.parentElement as HTMLElement | null;

    if (!actionsContainer) {
      return;
    }

    seenCards.add(card);
    seenFileIds.add(fileId);

    const htmlCard = card as HTMLElement;
    htmlCard.dataset.videoOptimizerFileId = String(fileId);

    const asset = uploadAssets.find((item) => item.id === fileId);

    if (asset?.hash) {
      htmlCard.dataset.videoOptimizerMediaHash = asset.hash;
    }

    const optimizeHost = ensureHost(
      actionsContainer,
      button,
      'data-video-optimizer-ml-optimize-host',
      fileId
    );
    const cancelHost = ensureHost(
      actionsContainer,
      optimizeHost,
      'data-video-optimizer-ml-cancel-host',
      fileId
    );

    const dimensions = extractAssetDimensions(card);

    entries.push({
      fileId,
      fileName: asset?.name ?? card.querySelector('[id$="-title"]')?.textContent?.trim() ?? '',
      width: dimensions?.width,
      height: dimensions?.height,
      optimizeHost,
      cancelHost,
    });
  });

  return entries;
};

const syncDomObserver = () => {
  if (!isMediaLibraryRoute()) {
    domObserver?.disconnect();
    domObserver = null;
    return;
  }

  if (!collectVideoCards().length) {
    domObserver?.disconnect();
    domObserver = null;
    return;
  }

  if (domObserver) {
    return;
  }

  const root = document.querySelector('main') ?? document.body;

  domObserver = new MutationObserver((mutations) => {
    if (!shouldSyncForMutations(mutations)) {
      return;
    }

    if (domObserverTimer) {
      return;
    }

    domObserverTimer = setTimeout(() => {
      domObserverTimer = null;
      syncCardActions();
    }, 250);
  });

  domObserver.observe(root, { childList: true, subtree: true });
};

const syncCardActions = async () => {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;

  try {
    if (!isMediaLibraryRoute()) {
      setMediaLibraryCards([]);
      domObserver?.disconnect();
      domObserver = null;
      return;
    }

    const videoCards = collectVideoCards();

    if (!videoCards.length) {
      cleanupCardActionHosts(new Set());
      setMediaLibraryCards([]);
      domObserver?.disconnect();
      domObserver = null;
      return;
    }

    prepareCardsForMatching(videoCards);
    const uploadAssets = await ensureUploadAssets();
    const entries = collectCardActions(uploadAssets);
    cleanupCardActionHosts(new Set(entries.map((entry) => entry.fileId)));
    setMediaLibraryCards(entries);
    syncDomObserver();
  } finally {
    syncInFlight = false;
  }
};

export const syncMediaLibraryCardActions = () => {
  void syncCardActions();
};

export const initMediaLibraryCardActions = () => {
  if (started || typeof window === 'undefined') {
    return;
  }

  started = true;

  const boot = () => {
    if (isMediaLibraryRoute()) {
      void syncCardActions();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
};
