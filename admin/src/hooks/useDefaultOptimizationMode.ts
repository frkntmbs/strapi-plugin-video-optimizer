import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID, type GlobalOptimizationSettings } from '../pluginId';

export const useDefaultOptimizationMode = () => {
  const { get } = useFetchClient();
  const [settings, setSettings] = useState<GlobalOptimizationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await get(`/${PLUGIN_ID}/default-mode`);
        setSettings(data);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [get]);

  return { settings, isLoading };
};
