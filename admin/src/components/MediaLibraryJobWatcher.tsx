import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { adminApi, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import { getTranslationKey, type VideoOptimizerJob } from '../pluginId';
import { isMediaLibraryPath } from '../utils/mediaLibraryRoute';
import { syncMediaLibraryProgress } from '../utils/initMediaLibraryProgress';
import { setWatchedJobs } from '../utils/jobProgressStore';

const POLL_INTERVAL_MS = 3000;

const invalidateMediaLibrary = (dispatch: ReturnType<typeof useDispatch>, fileId?: number) => {
  dispatch(
    adminApi.util.invalidateTags([
      { type: 'Asset', id: 'LIST' },
      ...(fileId ? [{ type: 'Asset' as const, id: fileId }] : []),
      { type: 'Folder', id: 'LIST' },
    ])
  );
};

export const MediaLibraryJobWatcher = () => {
  const { formatMessage } = useIntl();
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();
  const dispatch = useDispatch();
  const location = useLocation();
  const trackedJobs = useRef(new Map<string, VideoOptimizerJob>());
  const notifiedCompletedJobs = useRef(new Set<string>());
  const hadActiveJobs = useRef(false);
  const pollInFlight = useRef(false);

  const isMediaLibrary = isMediaLibraryPath(location.pathname);

  useEffect(() => {
    if (!isMediaLibrary) {
      setWatchedJobs([]);
      hadActiveJobs.current = false;
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (pollInFlight.current) {
        return;
      }

      pollInFlight.current = true;

      try {
        const { data } = await get<{ jobs?: VideoOptimizerJob[] }>('/video-optimizer/jobs/active');
        const jobs = data?.jobs ?? [];

        if (cancelled) {
          return;
        }

        setWatchedJobs(jobs);
        syncMediaLibraryProgress();

        if (jobs.length > 0) {
          hadActiveJobs.current = true;
        } else if (hadActiveJobs.current) {
          invalidateMediaLibrary(dispatch);
          hadActiveJobs.current = false;
        }

        const activeIds = new Set(jobs.map((job) => job.id));

        for (const [jobId, previous] of trackedJobs.current.entries()) {
          if (activeIds.has(jobId)) {
            continue;
          }

          if (previous.status !== 'queued' && previous.status !== 'processing') {
            trackedJobs.current.delete(jobId);
            continue;
          }

          const { data: finishedJob } = await get<VideoOptimizerJob>(`/video-optimizer/jobs/${jobId}`);

          if (cancelled || !finishedJob) {
            continue;
          }

          if (finishedJob.status === 'completed' && !notifiedCompletedJobs.current.has(jobId)) {
            notifiedCompletedJobs.current.add(jobId);
            invalidateMediaLibrary(dispatch, finishedJob.fileId);

            toggleNotification({
              type: 'success',
              message: formatMessage(
                { id: getTranslationKey('jobs.notification.completed') },
                { fileId: finishedJob.fileId, progress: finishedJob.progress }
              ),
            });
          } else if (finishedJob.status === 'failed' && !notifiedCompletedJobs.current.has(jobId)) {
            notifiedCompletedJobs.current.add(jobId);
            toggleNotification({
              type: 'danger',
              message: formatMessage(
                { id: getTranslationKey('jobs.notification.failed') },
                { error: finishedJob.error ?? 'Unknown error' }
              ),
            });
          }

          trackedJobs.current.delete(jobId);
        }

        for (const job of jobs) {
          trackedJobs.current.set(job.id, job);
        }
      } catch {
        // Ignore polling errors.
      } finally {
        pollInFlight.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setWatchedJobs([]);
    };
  }, [dispatch, formatMessage, get, isMediaLibrary, toggleNotification]);

  return null;
};
