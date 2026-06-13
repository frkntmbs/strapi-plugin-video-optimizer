import type { VideoOptimizerJob } from '../pluginId';
import { adminGet } from './adminFetch';
import {
  invalidateMediaLibraryCache,
} from './invalidateMediaLibrary';
import { syncMediaLibraryProgress } from './initMediaLibraryProgress';
import { syncMediaLibraryCardActions } from './initMediaLibraryCardActions';
import { setWatchedJobs } from './jobProgressStore';
import { isMediaLibraryPath } from './mediaLibraryRoute';

const ACTIVE_POLL_INTERVAL_MS = 3000;
const ROUTE_CHECK_INTERVAL_MS = 1000;

let activePollTimer: ReturnType<typeof setInterval> | null = null;
let routeCheckTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let pollInFlight = false;
let lastPathname = '';
const trackedJobs = new Map<string, VideoOptimizerJob>();

const isActiveJob = (job: VideoOptimizerJob) =>
  job.status === 'queued' || job.status === 'processing';

const hasActiveJobs = (jobs: VideoOptimizerJob[]) => jobs.some(isActiveJob);

const stopActivePolling = () => {
  if (!activePollTimer) {
    return;
  }

  clearInterval(activePollTimer);
  activePollTimer = null;
};

const startActivePolling = () => {
  if (activePollTimer) {
    return;
  }

  activePollTimer = setInterval(() => {
    void pollActiveJobs();
  }, ACTIVE_POLL_INTERVAL_MS);
};

const clearJobProgress = () => {
  stopActivePolling();
  trackedJobs.clear();
  setWatchedJobs([]);
  syncMediaLibraryProgress();
};

const handleFinishedJob = async (
  jobId: string,
  fallbackFileId: number,
  remainingActiveCount: number
) => {
  const previous = trackedJobs.get(jobId);
  trackedJobs.delete(jobId);

  const finished = await adminGet<VideoOptimizerJob>(`/video-optimizer/jobs/${jobId}`);
  const fileId = finished?.fileId ?? fallbackFileId;

  await invalidateMediaLibraryCache(fileId || undefined, previous?.fileName, {
    forceFullRefresh: remainingActiveCount === 0,
  });
};

const reconcileFinishedJobs = async (activeJobs: VideoOptimizerJob[]) => {
  const activeIds = new Set(activeJobs.map((job) => job.id));
  const pendingFinished: Array<Promise<void>> = [];

  for (const [jobId, previous] of trackedJobs.entries()) {
    if (activeIds.has(jobId)) {
      continue;
    }

    if (previous.status !== 'queued' && previous.status !== 'processing') {
      trackedJobs.delete(jobId);
      continue;
    }

    pendingFinished.push(
      handleFinishedJob(jobId, previous.fileId, activeJobs.length)
    );
  }

  if (pendingFinished.length) {
    await Promise.all(pendingFinished);
  }

  for (const job of activeJobs) {
    trackedJobs.set(job.id, job);
  }
};

export const pollActiveJobs = async () => {
  if (pollInFlight) {
    return;
  }

  const pathname = window.location.pathname;

  if (!isMediaLibraryPath(pathname)) {
    clearJobProgress();
    return;
  }

  pollInFlight = true;

  try {
    const data = await adminGet<{ jobs?: VideoOptimizerJob[] }>('/video-optimizer/jobs/active');
    const jobs = data?.jobs ?? [];

    await reconcileFinishedJobs(jobs);

    if (!hasActiveJobs(jobs)) {
      stopActivePolling();
      trackedJobs.clear();
      setWatchedJobs([]);
      syncMediaLibraryProgress();
      return;
    }

    setWatchedJobs(jobs);
    syncMediaLibraryProgress();
    startActivePolling();
  } catch {
    stopActivePolling();
  } finally {
    pollInFlight = false;
  }
};

export const wakeJobPoller = () => {
  void pollActiveJobs();
};

const handleRouteChange = (pathname: string) => {
  if (pathname === lastPathname) {
    return;
  }

  lastPathname = pathname;

  if (isMediaLibraryPath(pathname)) {
    void pollActiveJobs();
    syncMediaLibraryCardActions();
    return;
  }

  clearJobProgress();
};

export const initJobPoller = () => {
  if (started || typeof window === 'undefined') {
    return;
  }

  started = true;
  lastPathname = window.location.pathname;

  window.addEventListener('popstate', () => {
    handleRouteChange(window.location.pathname);
  });

  routeCheckTimer = setInterval(() => {
    handleRouteChange(window.location.pathname);
  }, ROUTE_CHECK_INTERVAL_MS);

  if (isMediaLibraryPath(lastPathname)) {
    void pollActiveJobs();
  }
};
