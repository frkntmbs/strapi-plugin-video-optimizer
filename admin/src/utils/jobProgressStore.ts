import type { VideoOptimizerJob } from '../pluginId';

export interface ProgressEntry {
  fileId: number;
  host: HTMLElement;
  job: VideoOptimizerJob;
}

let entries: ProgressEntry[] = [];
let entriesSnapshot: ProgressEntry[] = [];
let watchedJobs: VideoOptimizerJob[] = [];
let watchedJobsSnapshot: VideoOptimizerJob[] = [];
let activeFileIdsSnapshot: readonly number[] = [];
let activeFileIdsKey = '';
const listeners = new Set<() => void>();

const rebuildActiveFileIdsSnapshot = () => {
  const ids = watchedJobsSnapshot
    .filter((job) => job.status === 'queued' || job.status === 'processing')
    .map((job) => job.fileId)
    .sort((left, right) => left - right);
  const key = ids.join(',');

  if (key === activeFileIdsKey) {
    return;
  }

  activeFileIdsKey = key;
  activeFileIdsSnapshot = ids;
};

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const subscribeJobProgress = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getProgressEntries = () => entriesSnapshot;

export const getWatchedJobs = () => watchedJobsSnapshot;

export const getActiveJobFileIds = (): readonly number[] => {
  rebuildActiveFileIdsSnapshot();
  return activeFileIdsSnapshot;
};

export const hasActiveJobForFile = (fileId: number) => getActiveJobFileIds().includes(fileId);

const jobsEqual = (left: VideoOptimizerJob[], right: VideoOptimizerJob[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (job, index) =>
      job.id === right[index]?.id &&
      job.status === right[index]?.status &&
      job.progress === right[index]?.progress &&
      job.stage === right[index]?.stage &&
      job.error === right[index]?.error
  );
};

export const setWatchedJobs = (nextJobs: VideoOptimizerJob[]) => {
  if (jobsEqual(watchedJobs, nextJobs)) {
    return;
  }

  watchedJobs = nextJobs;
  watchedJobsSnapshot = nextJobs.slice();
  rebuildActiveFileIdsSnapshot();
  notify();
};

const entriesEqual = (left: ProgressEntry[], right: ProgressEntry[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (entry, index) =>
      entry.fileId === right[index]?.fileId &&
      entry.host === right[index]?.host &&
      entry.job.id === right[index]?.job.id &&
      entry.job.status === right[index]?.job.status &&
      entry.job.progress === right[index]?.job.progress &&
      entry.job.stage === right[index]?.job.stage &&
      entry.job.error === right[index]?.job.error
  );
};

export const setProgressEntries = (nextEntries: ProgressEntry[]) => {
  if (entriesEqual(entries, nextEntries)) {
    return;
  }

  entries = nextEntries;
  entriesSnapshot = nextEntries.slice();
  notify();
};

export const clearProgressEntries = () => {
  entries = [];
  entriesSnapshot = [];
  watchedJobs = [];
  watchedJobsSnapshot = [];
  activeFileIdsKey = '';
  activeFileIdsSnapshot = [];
  notify();
};
