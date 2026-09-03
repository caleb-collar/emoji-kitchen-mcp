// Export all types
export * from "./data/types.js";

// Export loader
export {
  loadMetadata,
  getMetadata,
  setMetadata,
  resetMetadata,
} from "./data/loader.js";

// Export image cache
export {
  getCachedImage,
  setCachedImage,
  getImageCacheSize,
  clearImageCache,
  MAX_IMAGE_CACHE_SIZE,
} from "./engine/cache.js";

// Export matcher
export {
  codepointToEmoji,
  emojiToCodepoint,
  resolveEmoji,
} from "./engine/matcher.js";

// Export search
export { searchEmojis } from "./engine/search.js";

// Export mixer
export {
  mixEmojis,
  getCombinations,
  getRandomCombination,
  getFeaturedEmojis,
} from "./engine/mixer.js";

// Export MCP server
export {
  createEmojiKitchenServer,
  initializeEmojiKitchenServer,
} from "./server.js";

