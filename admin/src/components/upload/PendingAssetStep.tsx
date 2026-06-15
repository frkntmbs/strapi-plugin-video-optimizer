import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import { Sparkle } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { AssetOptimizationLabel } from '../AssetOptimizationLabel';
import { OptimizationBenefitWarning } from '../OptimizationBenefitWarning';
import { OptimizationChoicePicker } from '../OptimizationChoicePicker';
import { OptimizationCustomForm } from '../OptimizationVideoFields';
import {
  createCustomForAsset,
  getAssetPreference,
  getSourceDimensionsForAsset,
  getSourceMetadataForAsset,
  resolveCustomSettingsForAsset,
  type UploadAssetEntry,
} from '../../utils/uploadAssetStore';
import { getTranslationKey, type AssetOptimizationPreference } from '../../pluginId';

interface PendingAssetStepProps {
  asset: UploadAssetEntry;
  preference: AssetOptimizationPreference;
  onPreferenceChange: (preference: AssetOptimizationPreference) => void;
}

export const PendingAssetStep = ({
  asset,
  preference,
  onPreferenceChange,
}: PendingAssetStepProps) => {
  const { formatMessage } = useIntl();

  const sourceDimensions = getSourceDimensionsForAsset(asset.assetId);
  const sourceMetadata = getSourceMetadataForAsset(asset.assetId);
  const resolvedCustom = resolveCustomSettingsForAsset(asset.assetId, preference.custom);

  const handleChoiceChange = (choice: AssetOptimizationPreference['choice']) => {
    onPreferenceChange({
      choice,
      custom:
        choice === 'custom'
          ? resolveCustomSettingsForAsset(asset.assetId, preference.custom)
          : undefined,
    });
  };

  return (
    <Box padding={4} background="neutral100" hasRadius>
      <Flex direction="column" gap={4} alignItems="stretch">
        <Flex alignItems="center" gap={2}>
          <Sparkle />
          <Typography variant="omega" fontWeight="bold">
            {formatMessage({ id: getTranslationKey('upload.modal.title') })}
          </Typography>
        </Flex>

        <Typography variant="pi" textColor="neutral600">
          {asset.assetName}
        </Typography>

        <OptimizationBenefitWarning
          choice={preference.choice}
          metadata={{
            width: asset.width ?? sourceMetadata.width ?? sourceDimensions?.width,
            height: asset.height ?? sourceMetadata.height ?? sourceDimensions?.height,
            sizeBytes: asset.sizeBytes ?? sourceMetadata.sizeBytes,
            durationSeconds: asset.durationSeconds ?? sourceMetadata.durationSeconds,
          }}
          customSettings={preference.choice === 'custom' ? resolvedCustom : undefined}
        />

        <OptimizationChoicePicker value={preference.choice} onChange={handleChoiceChange} />

        {preference.choice === 'custom' && (
          <OptimizationCustomForm
            value={resolvedCustom}
            onChange={(custom) => onPreferenceChange({ choice: 'custom', custom })}
            sourceWidth={asset.width ?? sourceDimensions?.width}
            sourceHeight={asset.height ?? sourceDimensions?.height}
          />
        )}

        <AssetOptimizationLabel preference={getAssetPreference(asset.assetId)} />
      </Flex>
    </Box>
  );
};

export const createPendingPreference = (assetId: string): AssetOptimizationPreference => ({
  choice: 'original',
  custom: createCustomForAsset(assetId),
});

export const mergePendingPreference = (
  assetId: string,
  preference?: AssetOptimizationPreference
): AssetOptimizationPreference => {
  if (!preference) {
    return { choice: 'original' };
  }

  if (preference.choice === 'custom') {
    return {
      choice: 'custom',
      custom: preference.custom ?? createCustomForAsset(assetId),
    };
  }

  return {
    choice: preference.choice,
  };
};
