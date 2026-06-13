export const isMediaLibraryPath = (pathname: string) => {
  const path = pathname.toLowerCase();

  return (
    path.includes('/plugins/upload') ||
    path.includes('/plugins/unstable-upload') ||
    path.includes('/media-library')
  );
};
