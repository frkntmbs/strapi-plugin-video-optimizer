import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { MediaLibraryProgressRoot } from '../components/BridgeProviders';
import {
  cleanupOrphanProgressHosts,
  clearJobCardRefs,
  collectVideoCards,
  findCardForJob,
  prepareCardsForMatching,
} from './mediaLibraryCardMatch';
import {
  clearProgressEntries,
  getProgressEntries,
  getWatchedJobs,
  setProgressEntries,
  subscribeJobProgress,
  type ProgressEntry,
} from './jobProgressStore';
import { getUploadAssetsFromCache } from './mediaLibraryQueryBridge';
import { isMediaLibraryPath } from './mediaLibraryRoute';
import { syncMediaLibraryCardActions } from './initMediaLibraryCardActions';

let progressRoot: Root | null = null;
let progressHost: HTMLElement | null = null;
let domObserver: MutationObserver | null = null;
let domObserverTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let syncInFlight = false;

const isMediaLibraryRoute = () => isMediaLibraryPath(window.location.pathname);

const ensureProgressBridge = () => {
  if (progressRoot) {
    return;
  }

  progressHost = document.createElement('div');
  progressHost.id = 'video-optimizer-media-library-progress';
  progressHost.style.cssText = 'display:none;';
  document.body.appendChild(progressHost);

  progressRoot = createRoot(progressHost);
  progressRoot.render(React.createElement(MediaLibraryProgressRoot));
};

export const ensureMediaLibraryBridge = () => {
  ensureProgressBridge();
};

const findCardFooter = (card: Element) => {
  const titleNode = card.querySelector('[id$="-title"]');
  const footerFromTitle = titleNode?.closest('article > div:last-of-type');

  if (footerFromTitle && card.contains(footerFromTitle)) {
    return footerFromTitle;
  }

  const directChildren = card.querySelectorAll(':scope > div');

  if (directChildren.length >= 2) {
    return directChildren[directChildren.length - 1]!;
  }

  return card;
};

const ensureProgressHost = (card: Element, fileId: number) => {
  const selector = `[data-video-optimizer-progress-host="${fileId}"]`;
  let host = card.querySelector(selector) as HTMLElement | null;

  if (!host) {
    host = document.createElement('div');
    host.dataset.videoOptimizerProgressHost = String(fileId);
    host.style.cssText = 'width:100%;box-sizing:border-box;display:block;';

    const cardBody =
      card.querySelector('[class*="CardBody"]') ??
      card.querySelector('[class*="CardContent"]') ??
      findCardFooter(card);

    cardBody.appendChild(host);
  }

  (card as HTMLElement).dataset.videoOptimizerFileId = String(fileId);
  return host;
};

const syncDomObserver = () => {
  const activeJobs = getWatchedJobs().filter(
    (job) => job.status === 'queued' || job.status === 'processing'
  );

  if (!activeJobs.length) {
    domObserver?.disconnect();
    domObserver = null;
    return;
  }

  if (domObserver) {
    return;
  }

  const root = document.querySelector('main') ?? document.body;

  domObserver = new MutationObserver(() => {
    if (domObserverTimer) {
      return;
    }

    domObserverTimer = setTimeout(() => {
      domObserverTimer = null;
      syncProgress();
    }, 250);
  });

  domObserver.observe(root, { childList: true, subtree: true });
};

const syncProgress = () => {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;

  try {
    if (!isMediaLibraryRoute()) {
      clearProgressEntries();
      domObserver?.disconnect();
      domObserver = null;
      return;
    }

    ensureProgressBridge();

    const activeJobs = getWatchedJobs().filter(
      (job) => job.status === 'queued' || job.status === 'processing'
    );

    if (!activeJobs.length) {
      cleanupOrphanProgressHosts(new Set());
      setProgressEntries([]);
      syncDomObserver();
      return;
    }

    const activeFileIds = new Set(activeJobs.map((job) => job.fileId));
    cleanupOrphanProgressHosts(activeFileIds);
    clearJobCardRefs(activeFileIds);

    const cards = collectVideoCards();
    prepareCardsForMatching(cards, syncMediaLibraryProgress);

    const uploadAssets = getUploadAssetsFromCache();
    const assignedCards = new Set<Element>();
    const existingByFileId = new Map(
      getProgressEntries().map((entry) => [entry.fileId, entry])
    );
    const nextEntries: ProgressEntry[] = [];

    for (const job of activeJobs) {
      const existing = existingByFileId.get(job.fileId);
      let card = findCardForJob(job, cards, assignedCards, uploadAssets);
      let host: HTMLElement | null = null;

      if (!card && existing?.host.isConnected) {
        host = existing.host;
        card =
          host.closest('article[role="button"], article[aria-labelledby], [role="listitem"]') ??
          host.parentElement;
      }

      if (!card) {
        continue;
      }

      assignedCards.add(card);
      host = host ?? ensureProgressHost(card, job.fileId);

      nextEntries.push({
        fileId: job.fileId,
        host,
        job,
      });
    }

    setProgressEntries(nextEntries);
    syncDomObserver();
    syncMediaLibraryCardActions();
  } finally {
    syncInFlight = false;
  }
};

export const syncMediaLibraryProgress = () => {
  syncProgress();
};

export const initMediaLibraryProgress = () => {
  if (started || typeof window === 'undefined') {
    return;
  }

  started = true;

  subscribeJobProgress(() => {
    syncProgress();
  });

  const boot = () => {
    syncProgress();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
};
