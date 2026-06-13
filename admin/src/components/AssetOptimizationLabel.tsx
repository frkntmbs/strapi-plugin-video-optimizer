import { Box, Flex, Typography } from '@strapi/design-system';
import { Sparkle } from '@strapi/icons';
import { useIntl } from 'react-intl';
import {
  getTranslationKey,
  type AssetOptimizationPreference,
  type GlobalOptimizationSettings,
} from '../pluginId';
import { getGlobalSettings } from '../utils/uploadAssetStore';

interface AssetOptimizationLabelProps {
  preference: AssetOptimizationPreference;
}

const getFormatLabelKey = (format: GlobalOptimizationSettings['defaultFormat']) =>
  getTranslationKey(`settings.format.${format}`);

export const AssetOptimizationLabel = ({ preference }: AssetOptimizationLabelProps) => {
  const { formatMessage } = useIntl();
  const globalSettings = getGlobalSettings();

  let label = '';

  if (preference.choice === 'original') {
    label = formatMessage({ id: getTranslationKey('choice.original') });
  } else if (preference.choice === 'global') {
    label = formatMessage(
      { id: getTranslationKey('upload.mode.footer.global') },
      { mode: formatMessage({ id: getFormatLabelKey(globalSettings.defaultFormat) }) }
    );
  } else if (preference.custom) {
    label = formatMessage(
      { id: getTranslationKey('upload.mode.footer.custom') },
      { mode: formatMessage({ id: getFormatLabelKey(preference.custom.defaultFormat) }) }
    );
  }

  if (!label) {
    return null;
  }

  return (
    <Box paddingTop={2} data-optimizer-mode-label="true">
      <Flex
        alignItems="center"
        gap={2}
        paddingTop={2}
        paddingBottom={2}
        paddingLeft={3}
        paddingRight={3}
        hasRadius
        background="neutral150"
      >
        <Sparkle width="12px" height="12px" fill="currentColor" />
        <Typography variant="pi" fontWeight="semiBold" textColor="primary600">
          {label}
        </Typography>
      </Flex>
    </Box>
  );
};
