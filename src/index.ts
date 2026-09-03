#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli.js";

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

// Export stdio transport
export {
  startStdioServer,
  type StdioServerController,
  type StdioServerOptions,
} from "./transports/stdio.js";

// Export SSE transport
export {
  startSseServer,
  createSseApp,
  type SseServerInstance,
  type SseSession,
  type SseServerOptions,
} from "./transports/sse.js";

// Export CLI utilities
export {
  runCli,
  parseArgs,
  type CliOptions,
  VERSION,
  HELP_TEXT,
} from "./cli.js";

/**
 * Determines whether this module is being executed directly as a script/CLI
 * rather than being imported by another module or test runner.
 */
function isDirectExecution(): boolean {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return false;
  }
  if (!process.argv[1]) {
    return false;
  }
  try {
    const currentPath = fileURLToPath(import.meta.url);
    const scriptPath = process.argv[1];

    const resolvedCurrent = path.resolve(currentPath);
    const resolvedScript = path.resolve(scriptPath);

    if (resolvedCurrent === resolvedScript) {
      return true;
    }

    const normCurrent = path.normalize(resolvedCurrent).toLowerCase();
    const normScript = path.normalize(resolvedScript).toLowerCase();
    if (normCurrent === normScript) {
      return true;
    }

    const basenameScript = path.basename(normScript);
    if (
      basenameScript === "emoji-kitchen-mcp" ||
      basenameScript === "emoji-kitchen-mcp.js" ||
      basenameScript === "emoji-kitchen-mcp.cmd"
    ) {
      return true;
    }

    const extCurrent = path.extname(normCurrent);
    const extScript = path.extname(normScript);
    if (
      extCurrent &&
      extScript &&
      normCurrent.slice(0, -extCurrent.length) ===
        normScript.slice(0, -extScript.length)
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  runCli().catch((err) => {
    console.error("Fatal error running Emoji Kitchen MCP server:", err);
    process.exit(1);
  });
}
