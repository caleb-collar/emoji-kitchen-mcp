/**
 * In-memory LRU cache for fetched Emoji Kitchen PNG images.
 * Keeps up to 500 images in memory to minimize network overhead and latency.
 */
export const MAX_IMAGE_CACHE_SIZE = 500;

const imageCache = new Map<string, Buffer>();

/**
 * Retrieves a cached image Buffer by URL, marking it as most recently used.
 */
export function getCachedImage(url: string): Buffer | undefined {
  if (!imageCache.has(url)) {
    return undefined;
  }
  const buffer = imageCache.get(url)!;
  // Refresh position in LRU order
  imageCache.delete(url);
  imageCache.set(url, buffer);
  return buffer;
}

/**
 * Caches an image Buffer under a URL, evicting the least recently used item if capacity is reached.
 */
export function setCachedImage(url: string, buffer: Buffer): void {
  if (imageCache.has(url)) {
    imageCache.delete(url);
  } else if (imageCache.size >= MAX_IMAGE_CACHE_SIZE) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey !== undefined) {
      imageCache.delete(oldestKey);
    }
  }
  imageCache.set(url, buffer);
}

/**
 * Returns current number of images in cache.
 */
export function getImageCacheSize(): number {
  return imageCache.size;
}

/**
 * Clears all cached images (useful for testing or memory pressure management).
 */
export function clearImageCache(): void {
  imageCache.clear();
}
