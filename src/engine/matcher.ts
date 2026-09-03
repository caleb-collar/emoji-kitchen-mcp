import { getMetadata } from "../data/loader.js";
import type { EmojiMetadata, ResolvedEmoji } from "../data/types.js";

/**
 * Converts a hex codepoint string (e.g. "1f431", "u1f431", "2764-fe0f") into a printable Unicode emoji.
 */
export function codepointToEmoji(codepoint: string): string {
  if (!codepoint || typeof codepoint !== "string") {
    return "";
  }
  const trimmed = codepoint.trim();
  if (!trimmed) {
    return "";
  }

  // Handle formats like "1f431", "u1f431", "U+1F431", "1f642-200d-2195-fe0f", "u1f62e_u200d_u1f4a8"
  const segments = trimmed
    .split(/[-_\s]+/)
    .map((s) => s.replace(/^[uU]\+?/, "").replace(/^0[xX]/, ""))
    .filter((s) => s.length > 0);

  try {
    const codePoints = segments.map((seg) => {
      const parsed = parseInt(seg, 16);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid hex codepoint segment: "${seg}"`);
      }
      return parsed;
    });

    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

/**
 * Converts a Unicode emoji sequence into a lowercase hyphen-separated hex codepoint string (e.g. "1f431", "2764-fe0f").
 */
export function emojiToCodepoint(emoji: string): string {
  if (!emoji || typeof emoji !== "string") {
    return "";
  }
  const trimmed = emoji.trim();
  if (!trimmed) {
    return "";
  }

  const codepoints: string[] = [];
  for (const char of trimmed) {
    const cp = char.codePointAt(0);
    if (cp !== undefined) {
      codepoints.push(cp.toString(16).toLowerCase());
    }
  }

  return codepoints.join("-");
}

/**
 * Strips variation selectors (\ufe0f and \ufe0e) from an emoji string.
 */
function stripVariationSelectors(str: string): string {
  return str.replace(/[\ufe0e\ufe0f]/g, "");
}

/**
 * Normalized representation of names/keywords (lowercase, underscores).
 */
function normalizeName(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

interface IndexLookupMaps {
  rawEmojiIndex: Map<string, ResolvedEmoji>;
  codepointIndex: Map<string, ResolvedEmoji>;
  exactNameIndex: Map<string, ResolvedEmoji>;
  keywordIndex: Map<string, ResolvedEmoji>;
}

// Cached index lookup maps keyed by metadata object reference
const metadataIndexCache = new WeakMap<EmojiMetadata, IndexLookupMaps>();

/**
 * Builds O(1) index lookup maps for all emojis in the given metadata.
 */
function buildIndexMaps(metadata: EmojiMetadata): IndexLookupMaps {
  const rawEmojiIndex = new Map<string, ResolvedEmoji>();
  const codepointIndex = new Map<string, ResolvedEmoji>();
  const exactNameIndex = new Map<string, ResolvedEmoji>();
  const keywordIndex = new Map<string, ResolvedEmoji>();

  for (const [keyCodepoint, emojiData] of Object.entries(metadata.data)) {
    const resolved: ResolvedEmoji = {
      codepoint: emojiData.emojiCodepoint,
      character: emojiData.emoji,
      alt: emojiData.alt,
    };

    // 1. Raw Unicode mappings
    const rawEmoji = emojiData.emoji;
    rawEmojiIndex.set(rawEmoji, resolved);

    const strippedEmoji = stripVariationSelectors(rawEmoji);
    if (!rawEmojiIndex.has(strippedEmoji)) {
      rawEmojiIndex.set(strippedEmoji, resolved);
    }
    const withFe0f = strippedEmoji + "\ufe0f";
    if (!rawEmojiIndex.has(withFe0f)) {
      rawEmojiIndex.set(withFe0f, resolved);
    }

    // Codepoint-to-emoji string conversion mapping
    const generatedEmoji = codepointToEmoji(keyCodepoint);
    if (generatedEmoji && !rawEmojiIndex.has(generatedEmoji)) {
      rawEmojiIndex.set(generatedEmoji, resolved);
    }

    // 2. Codepoint mappings
    const lowerKey = keyCodepoint.toLowerCase();
    codepointIndex.set(lowerKey, resolved);
    codepointIndex.set(`u${lowerKey}`, resolved);
    codepointIndex.set(`u+${lowerKey}`, resolved);
    codepointIndex.set(lowerKey.replace(/-/g, "_"), resolved);

    // If key ends with -fe0f, map version without it
    if (lowerKey.endsWith("-fe0f")) {
      const withoutFe0f = lowerKey.slice(0, -5);
      if (!codepointIndex.has(withoutFe0f)) {
        codepointIndex.set(withoutFe0f, resolved);
        codepointIndex.set(`u${withoutFe0f}`, resolved);
        codepointIndex.set(`u+${withoutFe0f}`, resolved);
      }
    } else {
      // Map version with -fe0f
      const withFe0fCp = `${lowerKey}-fe0f`;
      if (!codepointIndex.has(withFe0fCp)) {
        codepointIndex.set(withFe0fCp, resolved);
      }
    }

    // Also map emojiCodepoint property if different from key
    if (emojiData.emojiCodepoint) {
      const lowerCp = emojiData.emojiCodepoint.toLowerCase();
      codepointIndex.set(lowerCp, resolved);
      codepointIndex.set(`u${lowerCp}`, resolved);
    }

    // 3. Exact name mappings
    const normalizedAlt = normalizeName(emojiData.alt);
    exactNameIndex.set(normalizedAlt, resolved);
    exactNameIndex.set(emojiData.alt.toLowerCase(), resolved);
    exactNameIndex.set(normalizedAlt.replace(/_/g, " "), resolved);
    exactNameIndex.set(normalizedAlt.replace(/_/g, ""), resolved);

    // 4. Keyword mappings
    if (Array.isArray(emojiData.keywords)) {
      for (const kw of emojiData.keywords) {
        const normKw = normalizeName(kw);
        if (!keywordIndex.has(normKw)) {
          keywordIndex.set(normKw, resolved);
        }
        const spaceKw = normKw.replace(/_/g, " ");
        if (!keywordIndex.has(spaceKw)) {
          keywordIndex.set(spaceKw, resolved);
        }
        const cleanKw = normKw.replace(/_/g, "");
        if (!keywordIndex.has(cleanKw)) {
          keywordIndex.set(cleanKw, resolved);
        }
      }
    }
  }

  const indexes = { rawEmojiIndex, codepointIndex, exactNameIndex, keywordIndex };
  metadataIndexCache.set(metadata, indexes);
  return indexes;
}

/**
 * Gets or builds lookup indexes for the given metadata.
 */
function getIndexMaps(metadata?: EmojiMetadata): IndexLookupMaps {
  const meta = metadata ?? getMetadata();
  let indexes = metadataIndexCache.get(meta);
  if (!indexes) {
    indexes = buildIndexMaps(meta);
  }
  return indexes;
}

/**
 * Resolves an arbitrary emoji input (Unicode emoji, hex codepoint, shortcode, name, or keyword)
 * to its canonical { codepoint, character, alt } representation.
 * Returns null if not recognized as a supported Emoji Kitchen emoji.
 */
export function resolveEmoji(
  input: string,
  metadata?: EmojiMetadata
): ResolvedEmoji | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  let cleaned = input.trim();
  if (!cleaned) {
    return null;
  }

  // Strip leading/trailing colons (e.g. ":cat:" -> "cat")
  if (cleaned.startsWith(":") && cleaned.endsWith(":") && cleaned.length > 2) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const { rawEmojiIndex, codepointIndex, exactNameIndex, keywordIndex } =
    getIndexMaps(metadata);

  // 1. Direct Unicode character match
  const rawMatch =
    rawEmojiIndex.get(cleaned) ??
    rawEmojiIndex.get(stripVariationSelectors(cleaned)) ??
    rawEmojiIndex.get(cleaned + "\ufe0f");

  if (rawMatch) {
    return rawMatch;
  }

  // 2. Convert Unicode character to codepoints and look up
  const convertedCp = emojiToCodepoint(cleaned);
  if (convertedCp) {
    const cpFromUnicode =
      codepointIndex.get(convertedCp) ??
      codepointIndex.get(convertedCp.replace(/-fe0f$/, "")) ??
      codepointIndex.get(`${convertedCp}-fe0f`);

    if (cpFromUnicode) {
      return cpFromUnicode;
    }
  }

  // 3. Hex codepoint lookup (e.g. "1f431", "u1f431", "2764-fe0f")
  const normCodepoint = cleaned
    .toLowerCase()
    .replace(/^[uU]\+?/, "")
    .replace(/^0[xX]/, "")
    .replace(/_/g, "-");

  const cpMatch =
    codepointIndex.get(normCodepoint) ??
    codepointIndex.get(`u${normCodepoint}`) ??
    codepointIndex.get(normCodepoint.replace(/-fe0f$/, "")) ??
    codepointIndex.get(`${normCodepoint}-fe0f`);

  if (cpMatch) {
    return cpMatch;
  }

  // 4. Exact name / alt match (e.g. "cat", "fire", "magic_wand", "magic wand")
  const normName = normalizeName(cleaned);
  const nameMatch =
    exactNameIndex.get(normName) ??
    exactNameIndex.get(cleaned.toLowerCase()) ??
    exactNameIndex.get(normName.replace(/_/g, ""));

  if (nameMatch) {
    return nameMatch;
  }

  // 5. Keyword match (e.g. "love", "kitty")
  const kwMatch =
    keywordIndex.get(normName) ??
    keywordIndex.get(cleaned.toLowerCase()) ??
    keywordIndex.get(normName.replace(/_/g, ""));

  if (kwMatch) {
    return kwMatch;
  }

  return null;
}
