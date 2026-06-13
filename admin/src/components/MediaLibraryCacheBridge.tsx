import { useEffect } from 'react';
import { useQueryClient } from 'react-query';
import { useDispatch } from 'react-redux';
import {
  registerMediaLibraryDispatch,
  registerMediaLibraryQueryClient,
} from '../utils/invalidateMediaLibrary';

export const MediaLibraryCacheBridge = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  useEffect(() => {
    registerMediaLibraryDispatch(dispatch);
    registerMediaLibraryQueryClient(queryClient);

    return () => {
      registerMediaLibraryDispatch(null);
      registerMediaLibraryQueryClient(null);
    };
  }, [dispatch, queryClient]);

  return null;
};
