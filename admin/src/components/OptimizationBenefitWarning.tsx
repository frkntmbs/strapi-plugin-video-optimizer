import { Box, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { getTranslationKey, type OptimizationChoice, type OptimizationSettings } from '../pluginId';
import {
  evaluateOptimizationBenefit,
  type VideoSourceMetadata,
} from '../utils/evaluateOptimizationBenefit';
import { getGlobalSettings } from '../utils/uploadAssetStore';

interface OptimizationBenefitWarningProps {
  choice: OptimizationChoice;
  metadata: VideoSourceMetadata;
  customSettings?: OptimizationSettings;
}

export const OptimizationBenefitWarning = ({
  choice,
  metadata,
  customSettings,
}: OptimizationBenefitWarningProps) => {
  const { formatMessage } = useIntl();
  const showWarning = evaluateOptimizationBenefit(
    choice,
    metadata,
    getGlobalSettings(),
    customSettings
  );

  if (!showWarning) {
    return null;
  }

  return (
    <Box
      padding={4}
      hasRadius
      background="warning100"
      borderColor="warning200"
      borderStyle="solid"
      borderWidth="1px"
    >
      <Typography variant="omega" fontWeight="bold" textColor="warning700">
        {formatMessage({ id: getTranslationKey('optimization.warning.title') })}
      </Typography>
      <Box paddingTop={1}>
        <Typography variant="pi" textColor="warning700">
          {formatMessage({ id: getTranslationKey('optimization.warning.description') })}
        </Typography>
      </Box>
    </Box>
  );
};
