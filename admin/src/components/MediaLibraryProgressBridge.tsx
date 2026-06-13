import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Box, Flex, Loader, ProgressBar, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { styled } from 'styled-components';
import { getTranslationKey, type VideoOptimizerJob } from '../pluginId';
import { getProgressEntries, subscribeJobProgress } from '../utils/jobProgressStore';

const ProgressSection = styled(Box)`
  width: 100%;
  margin-top: ${({ theme }) => theme.spaces[3]};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral150};
  background: transparent;
`;

const ProgressHeader = styled(Flex)`
  padding-top: ${({ theme }) => theme.spaces[3]};
  padding-bottom: ${({ theme }) => theme.spaces[2]};
`;

const StyledProgressBar = styled(ProgressBar)`
  width: 100%;

  & > div {
    background-color: ${({ theme }) => theme.colors.primary600};
  }
`;

const QueuedLoader = styled(Loader)`
  width: 20px;
  height: 20px;
  margin-top: -5px;
  margin-bottom: -5px;

  svg {
    width: 20px;
    height: 20px;
  }
`;

const JobProgressBadge = ({ job }: { job: VideoOptimizerJob }) => {
  const { formatMessage } = useIntl();

  const isQueued = job.status === 'queued';

  const stageLabel =
    !isQueued && job.stage && job.status === 'processing'
      ? formatMessage({
          id: getTranslationKey(`jobs.stage.${job.stage}`),
          defaultMessage: job.stage,
        })
      : null;

  const formatLabel = job.settings?.defaultFormat?.toUpperCase();

  return (
    <ProgressSection data-video-optimizer-progress={job.fileId}>
      <ProgressHeader justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="pi" fontWeight="semiBold" textColor="neutral800">
          {formatMessage(
            { id: getTranslationKey('jobs.card.progress') },
            { progress: job.progress, format: formatLabel ?? '—' }
          )}
        </Typography>

        {isQueued ? (
          <Flex alignItems="center" gap={2}>
            <QueuedLoader small />
            <Typography variant="pi" textColor="neutral600">
              {formatMessage({ id: getTranslationKey('jobs.card.queued') })}
            </Typography>
          </Flex>
        ) : (
          stageLabel && (
            <Typography variant="pi" textColor="neutral600">
              {stageLabel}
            </Typography>
          )
        )}
      </ProgressHeader>

      <StyledProgressBar value={job.progress} size="M" />
    </ProgressSection>
  );
};

export const MediaLibraryProgressBridge = () => {
  const entries = useSyncExternalStore(subscribeJobProgress, getProgressEntries);

  return (
    <>
      {entries.map((entry) =>
        createPortal(<JobProgressBadge job={entry.job} />, entry.host, String(entry.fileId))
      )}
    </>
  );
};
