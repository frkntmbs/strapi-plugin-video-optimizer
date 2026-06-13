import { useMutation } from '@tanstack/react-query';
import { useFetchClient } from '@strapi/strapi/admin';
import type { AssetOptimizationPreference } from '../pluginId';

interface UploadFilePayload {
  file: File;
  fileInfo?: Record<string, unknown>;
  preference?: AssetOptimizationPreference;
}

export const useUploadWithOptimizer = () => {
  const { post } = useFetchClient();

  return useMutation({
    mutationFn: async ({ file, fileInfo = {}, preference }: UploadFilePayload) => {
      const formData = new FormData();
      formData.append('files', file);

      const payload = {
        ...fileInfo,
        optimizationChoice: preference?.choice ?? 'original',
        ...(preference?.choice === 'custom' && preference.custom
          ? { optimizationCustom: preference.custom }
          : {}),
      };

      formData.append('fileInfo', JSON.stringify(payload));

      if (preference) {
        formData.append(
          'videoOptimizerPreferences',
          JSON.stringify([
            {
              fileName: file.name,
              preference,
            },
          ])
        );
      }

      const { data } = await post('/upload', formData);
      return data;
    },
  });
};
