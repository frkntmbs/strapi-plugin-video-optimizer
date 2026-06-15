import React, { useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Typography,
} from '@strapi/design-system';
import { Cross, Sparkle, Stop } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { OptimizationBenefitWarning } from './OptimizationBenefitWarning';
import { OptimizationChoicePicker } from './OptimizationChoicePicker';
import { OptimizationCustomForm } from './OptimizationVideoFields';
import { getTranslationKey } from '../pluginId';
import {
  getActiveJobFileIds,
  subscribeJobProgress,
} from '../utils/jobProgressStore';
import {
  cancelMediaLibraryJob,
  closeMediaLibraryEditor,
  createCustomForMediaLibraryFile,
  getEditingMediaLibraryDimensions,
  getEditingMediaLibrarySizeBytes,
  getEditingMediaLibraryFileId,
  getEditingMediaLibraryFileName,
  getMediaLibraryCards,
  getMediaLibraryDraftPreference,
  getMediaLibraryStoreRevision,
  isMediaLibraryCancelInFlight,
  isMediaLibraryEnqueueInFlight,
  openMediaLibraryEditor,
  saveMediaLibraryEditor,
  setMediaLibraryDraftChoice,
  setMediaLibraryDraftCustom,
  subscribeMediaLibraryCards,
} from '../utils/mediaLibraryCardStore';

const stopEventPropagation = (event: MouseEvent | PointerEvent) => {
  event.stopPropagation();
};

export const MediaLibraryCardActionsBridge = () => {
  const { formatMessage } = useIntl();
  const cards = useSyncExternalStore(subscribeMediaLibraryCards, getMediaLibraryCards);
  const activeJobFileIds = useSyncExternalStore(subscribeJobProgress, getActiveJobFileIds);
  const editingFileId = useSyncExternalStore(subscribeMediaLibraryCards, getEditingMediaLibraryFileId);
  const editingFileName = useSyncExternalStore(subscribeMediaLibraryCards, getEditingMediaLibraryFileName);
  const editingDimensions = useSyncExternalStore(
    subscribeMediaLibraryCards,
    getEditingMediaLibraryDimensions
  );
  const editingSizeBytes = useSyncExternalStore(
    subscribeMediaLibraryCards,
    getEditingMediaLibrarySizeBytes
  );
  const draftPreference = useSyncExternalStore(
    subscribeMediaLibraryCards,
    getMediaLibraryDraftPreference
  );
  const enqueueInFlight = useSyncExternalStore(
    subscribeMediaLibraryCards,
    isMediaLibraryEnqueueInFlight
  );
  useSyncExternalStore(subscribeMediaLibraryCards, getMediaLibraryStoreRevision);

  const activeJobIdSet = React.useMemo(
    () => new Set(activeJobFileIds),
    [activeJobFileIds]
  );

  const canEnqueue = draftPreference.choice !== 'original';

  const resolvedCustom =
    draftPreference.choice === 'custom'
      ? draftPreference.custom ?? createCustomForMediaLibraryFile()
      : undefined;

  const editorPanel =
    editingFileId !== null ? (
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        style={{ zIndex: 100, pointerEvents: 'auto' }}
        onPointerDown={stopEventPropagation}
        onMouseDown={stopEventPropagation}
        onClick={stopEventPropagation}
      >
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          background="neutral800"
          style={{ opacity: 0.2 }}
          onClick={closeMediaLibraryEditor}
        />

        <Flex
          direction="column"
          alignItems="stretch"
          background="neutral0"
          hasRadius
          shadow="popupShadow"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(520px, calc(100% - 32px))',
            maxHeight: 'min(90vh, 640px)',
            overflow: 'hidden',
            zIndex: 101,
          }}
        >
          <Flex
            tag="header"
            padding={4}
            paddingLeft={5}
            paddingRight={5}
            background="neutral100"
            justifyContent="space-between"
            alignItems="center"
            borderColor="neutral150"
            borderWidth="0 0 1px"
            borderStyle="solid"
          >
            <Typography variant="omega" fontWeight="bold" textColor="neutral800">
              {formatMessage({ id: getTranslationKey('mediaLibrary.modal.title') })}
            </Typography>
            <IconButton
              label={formatMessage({ id: getTranslationKey('upload.modal.cancel') })}
              onClick={closeMediaLibraryEditor}
            >
              <Cross />
            </IconButton>
          </Flex>

          <Box padding={7} style={{ overflow: 'auto' }}>
            <Flex direction="column" alignItems="stretch" gap={5}>
              {editingFileName && (
                <Typography variant="pi" textColor="neutral600">
                  {editingFileName}
                </Typography>
              )}
              <OptimizationBenefitWarning
                choice={draftPreference.choice}
                metadata={{
                  width: editingDimensions?.width,
                  height: editingDimensions?.height,
                  sizeBytes: editingSizeBytes,
                }}
                customSettings={resolvedCustom ?? undefined}
              />
              <OptimizationChoicePicker
                value={draftPreference.choice}
                onChange={setMediaLibraryDraftChoice}
              />
              {draftPreference.choice === 'custom' && (
                <Box background="neutral100" padding={5} hasRadius>
                  <OptimizationCustomForm
                    value={resolvedCustom ?? createCustomForMediaLibraryFile()}
                    onChange={setMediaLibraryDraftCustom}
                    sourceWidth={editingDimensions?.width}
                    sourceHeight={editingDimensions?.height}
                  />
                </Box>
              )}
            </Flex>
          </Box>

          <Flex
            tag="footer"
            gap={2}
            justifyContent="flex-end"
            padding={4}
            paddingLeft={5}
            paddingRight={5}
            background="neutral100"
            borderColor="neutral150"
            borderWidth="1px 0 0"
            borderStyle="solid"
          >
            <Button onClick={closeMediaLibraryEditor} variant="tertiary">
              {formatMessage({ id: getTranslationKey('upload.modal.cancel') })}
            </Button>
            <Button
              onClick={() => {
                void saveMediaLibraryEditor();
              }}
              disabled={!canEnqueue || enqueueInFlight}
              loading={enqueueInFlight}
            >
              {formatMessage({ id: getTranslationKey('mediaLibrary.modal.start') })}
            </Button>
          </Flex>
        </Flex>
      </Box>
    ) : null;

  return (
    <>
      {cards.map((card) => {
        const hasActiveJob = activeJobIdSet.has(card.fileId);
        const cancelInFlight = isMediaLibraryCancelInFlight(card.fileId);

        if (!card.optimizeHost.isConnected || !card.cancelHost.isConnected) {
          return null;
        }

        return (
          <React.Fragment key={card.fileId}>
            {!hasActiveJob
              ? createPortal(
                  <IconButton
                    label={formatMessage({
                      id: getTranslationKey('mediaLibrary.button.optimize'),
                    })}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openMediaLibraryEditor(card.fileId, card.fileName, {
                        width: card.width,
                        height: card.height,
                        sizeBytes: card.sizeBytes,
                      });
                    }}
                  >
                    <Sparkle />
                  </IconButton>,
                  card.optimizeHost
                )
              : null}

            {hasActiveJob
              ? createPortal(
                  <IconButton
                    label={formatMessage({
                      id: getTranslationKey('mediaLibrary.button.cancel'),
                    })}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void cancelMediaLibraryJob(card.fileId);
                    }}
                    disabled={cancelInFlight}
                  >
                    <Stop />
                  </IconButton>,
                  card.cancelHost
                )
              : null}
          </React.Fragment>
        );
      })}

      {editorPanel ? createPortal(editorPanel, document.body) : null}
    </>
  );
};
