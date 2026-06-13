import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import { Sparkle } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { AssetOptimizationLabel } from '../AssetOptimizationLabel';
import { OptimizationChoicePicker } from '../OptimizationChoicePicker';
import { OptimizationCustomForm } from '../OptimizationVideoFields';
import {
  createCustomForAsset,
  createCustomFromGlobal,
  getAssetPreference,
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

  const handleChoiceChange = (choice: AssetOptimizationPreference['choice']) => {
    onPreferenceChange({
      choice,
      custom:
        choice === 'custom'
          ? preference.custom ?? createCustomForAsset(asset.assetId)
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

        <OptimizationChoicePicker value={preference.choice} onChange={handleChoiceChange} />

        {preference.choice === 'custom' && (
          <OptimizationCustomForm
            value={preference.custom ?? createCustomForAsset(asset.assetId)}
            onChange={(custom) => onPreferenceChange({ choice: 'custom', custom })}
            sourceWidth={asset.width}
            sourceHeight={asset.height}
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
