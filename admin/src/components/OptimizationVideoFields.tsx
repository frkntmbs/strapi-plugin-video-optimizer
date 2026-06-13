import React from 'react';
import { Field, Grid, SingleSelect, SingleSelectOption, TextInput, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import {
  codecForFormat,
  getTranslationKey,
  type AudioMode,
  type FfmpegPreset,
  type OptimizationSettings,
  type VideoFormat,
} from '../pluginId';
import { OptimizationResizeFields } from './OptimizationResizeFields';

interface OptimizationVideoFieldsProps {
  value: Pick<
    OptimizationSettings,
    'defaultFormat' | 'videoCodec' | 'crf' | 'preset' | 'audioMode' | 'audioBitrate'
  >;
  onChange: (patch: Partial<OptimizationSettings>) => void;
  disabled?: boolean;
  namePrefix?: string;
}

const FORMATS: VideoFormat[] = ['mp4', 'webm'];
const PRESETS: FfmpegPreset[] = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
];
const AUDIO_MODES: AudioMode[] = ['keep', 'remove', 'compress'];

export const OptimizationVideoFields = ({
  value,
  onChange,
  disabled = false,
  namePrefix = '',
}: OptimizationVideoFieldsProps) => {
  const { formatMessage } = useIntl();

  const handleFormatChange = (format: VideoFormat) => {
    onChange({
      defaultFormat: format,
      videoCodec: codecForFormat(format),
    });
  };

  return (
    <>
      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
        <Field.Root name={`${namePrefix}defaultFormat`}>
          <Field.Label>
            {formatMessage({ id: getTranslationKey('settings.global.defaultFormat') })}
          </Field.Label>
          <SingleSelect
            value={value.defaultFormat}
            onChange={handleFormatChange}
            disabled={disabled}
          >
            {FORMATS.map((format) => (
              <SingleSelectOption key={format} value={format}>
                {formatMessage({ id: getTranslationKey(`settings.format.${format}`) })}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Field.Root>
      </Grid.Item>

      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
        <Field.Root name={`${namePrefix}crf`}>
          <Field.Label>
            {formatMessage({ id: getTranslationKey('settings.global.crf') })}
          </Field.Label>
          <TextInput
            type="number"
            min={0}
            max={51}
            value={value.crf}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ crf: Number(e.target.value) })
            }
            disabled={disabled}
          />
          <Field.Hint>
            {formatMessage({ id: getTranslationKey('settings.global.crfHint') })}
          </Field.Hint>
        </Field.Root>
      </Grid.Item>

      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
        <Field.Root name={`${namePrefix}preset`}>
          <Field.Label>
            {formatMessage({ id: getTranslationKey('settings.global.preset') })}
          </Field.Label>
          <SingleSelect
            value={value.preset}
            onChange={(preset: FfmpegPreset) => onChange({ preset })}
            disabled={disabled}
          >
            {PRESETS.map((preset) => (
              <SingleSelectOption key={preset} value={preset}>
                {preset}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Field.Root>
      </Grid.Item>

      <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
        <Field.Root name={`${namePrefix}audioMode`}>
          <Field.Label>
            {formatMessage({ id: getTranslationKey('settings.global.audioMode') })}
          </Field.Label>
          <SingleSelect
            value={value.audioMode}
            onChange={(audioMode: AudioMode) => onChange({ audioMode })}
            disabled={disabled}
          >
            {AUDIO_MODES.map((mode) => (
              <SingleSelectOption key={mode} value={mode}>
                {formatMessage({ id: getTranslationKey(`settings.audioMode.${mode}`) })}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Field.Root>
      </Grid.Item>

      {value.audioMode === 'compress' && (
        <Grid.Item col={6} xs={12} direction="column" alignItems="stretch">
          <Field.Root name={`${namePrefix}audioBitrate`}>
            <Field.Label>
              {formatMessage({ id: getTranslationKey('settings.global.audioBitrate') })}
            </Field.Label>
            <TextInput
              value={value.audioBitrate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ audioBitrate: e.target.value })
              }
              disabled={disabled}
            />
          </Field.Root>
        </Grid.Item>
      )}

      <Grid.Item col={12} direction="column" alignItems="stretch">
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslationKey('settings.global.codecHint'),
            defaultMessage: 'Codec is selected automatically based on the output format.',
          })}{' '}
          ({value.videoCodec.toUpperCase()})
        </Typography>
      </Grid.Item>
    </>
  );
};

interface OptimizationCustomFormProps {
  value: OptimizationSettings;
  onChange: (value: OptimizationSettings) => void;
  sourceWidth?: number;
  sourceHeight?: number;
  disabled?: boolean;
}

export const OptimizationCustomForm = ({
  value,
  onChange,
  sourceWidth,
  sourceHeight,
  disabled = false,
}: OptimizationCustomFormProps) => {
  const update = (patch: Partial<OptimizationSettings>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <Grid.Root gap={4}>
      <OptimizationVideoFields
        value={value}
        onChange={update}
        disabled={disabled}
        namePrefix="custom"
      />

      <OptimizationResizeFields
        value={value}
        sourceWidth={sourceWidth}
        sourceHeight={sourceHeight}
        onChange={update}
        disabled={disabled}
        namePrefix="custom"
      />
    </Grid.Root>
  );
};
