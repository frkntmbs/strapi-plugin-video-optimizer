export const extractAssetDimensions = (card: Element) => {
  const video = card.querySelector('video');

  if (video instanceof HTMLVideoElement && video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }

  const img = card.querySelector('img');

  if (img instanceof HTMLImageElement && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { width: img.naturalWidth, height: img.naturalHeight };
  }

  const cardText = card.textContent ?? '';
  const match = cardText.match(/(\d+)\s*[×✕xX]\s*(\d+)/);

  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  return undefined;
};
