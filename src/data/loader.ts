import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EmojiMetadata } from "./types.js";

const REMOTE_METADATA_URL =
  "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";

let cachedMetadata: EmojiMetadata | null = null;
let loadPromise: Promise<EmojiMetadata> | null = null;

/**
 * Resolves candidate local paths for metadata.json
 */
function getMetadataPaths(): { candidatePaths: string[]; defaultSavePath: string } {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  // Path relative to src/data or dist/data
  const relativeToModule = path.resolve(currentDir, "../../data/metadata.json");
  // Path relative to process working directory
  const relativeToCwd = path.resolve(process.cwd(), "data/metadata.json");

  const candidatePaths = Array.from(new Set([relativeToModule, relativeToCwd]));
  return {
    candidatePaths,
    defaultSavePath: candidatePaths[0],
  };
}

/**
 * Loads Emoji Kitchen metadata from disk, or downloads it from GitHub if absent.
 * Safe to call concurrently or multiple times; subsequent calls return the cached singleton.
 */
export async function loadMetadata(): Promise<EmojiMetadata> {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const { candidatePaths, defaultSavePath } = getMetadataPaths();

    let existingPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        existingPath = p;
        break;
      }
    }

    if (existingPath) {
      try {
        const fileContent = await fs.promises.readFile(existingPath, "utf-8");
        cachedMetadata = JSON.parse(fileContent) as EmojiMetadata;
        return cachedMetadata;
      } catch (err) {
        console.warn(`[Emoji Kitchen] Failed to read local metadata at ${existingPath}:`, err);
        // Fall back to downloading
      }
    }

    // Download from remote repository
    console.log(`[Emoji Kitchen] Metadata not found locally. Downloading from ${REMOTE_METADATA_URL}...`);
    const response = await fetch(REMOTE_METADATA_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to download metadata from ${REMOTE_METADATA_URL}: ${response.status} ${response.statusText}`
      );
    }

    const rawText = await response.text();
    const parsed = JSON.parse(rawText) as EmojiMetadata;

    // Save locally for subsequent runs
    try {
      const parentDir = path.dirname(defaultSavePath);
      if (!fs.existsSync(parentDir)) {
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
      await fs.promises.writeFile(defaultSavePath, rawText, "utf-8");
      console.log(`[Emoji Kitchen] Saved downloaded metadata to ${defaultSavePath}`);
    } catch (saveErr) {
      console.warn(`[Emoji Kitchen] Could not cache metadata to disk at ${defaultSavePath}:`, saveErr);
    }

    cachedMetadata = parsed;
    return cachedMetadata;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * Returns the synchronously cached metadata singleton.
 * Throws an Error if loadMetadata() has not been called and resolved yet.
 */
export function getMetadata(): EmojiMetadata {
  if (!cachedMetadata) {
    throw new Error(
      "Emoji Kitchen metadata has not been loaded. Call await loadMetadata() first."
    );
  }
  return cachedMetadata;
}

/**
 * Manually set the cached metadata (useful for tests or custom initialization).
 */
export function setMetadata(metadata: EmojiMetadata): void {
  cachedMetadata = metadata;
}

/**
 * Reset cached metadata (primarily for testing).
 */
export function resetMetadata(): void {
  cachedMetadata = null;
  loadPromise = null;
}
