import { getMetadata } from "../data/loader.js";
import type {
  CombinationsResult,
  EmojiCombination,
  EmojiMetadata,
  FeaturedCategory,
  MixResponse,
  MixResult,
} from "../data/types.js";
import { getCachedImage, setCachedImage } from "./cache.js";
import { resolveEmoji } from "./matcher.js";

const DEFAULT_COMBINATIONS_LIMIT = 50;

/**
 * Fetches an image from a URL, using the in-memory LRU cache when possible,
 * and converts it to a base64 string.
 */
async function fetchImageBase64(url: string): Promise<string | undefined> {
  try {
    const cached = getCachedImage(url);
    if (cached) {
      return cached.toString("base64");
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        `[Emoji Kitchen] Failed to fetch image from ${url}: ${response.status} ${response.statusText}`
      );
      return undefined;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    setCachedImage(url, buffer);
    return buffer.toString("base64");
  } catch (err) {
    console.warn(`[Emoji Kitchen] Error fetching image from ${url}:`, err);
    return undefined;
  }
}

/**
 * Finds the latest combination between two emojis symmetrically (left -> right or right -> left).
 */
function findCombination(
  leftCodepoint: string,
  rightCodepoint: string,
  metadata: EmojiMetadata
): EmojiCombination | null {
  const leftData = metadata.data[leftCodepoint];
  const rightData = metadata.data[rightCodepoint];

  const leftToRight = leftData?.combinations?.[rightCodepoint];
  const rightToLeft = rightData?.combinations?.[leftCodepoint];

  const candidateList =
    leftToRight && leftToRight.length > 0
      ? leftToRight
      : rightToLeft && rightToLeft.length > 0
        ? rightToLeft
        : null;

  if (!candidateList || candidateList.length === 0) {
    return null;
  }

  // Extract the latest combination, falling back to the last element in list
  return candidateList.find((c) => c.isLatest) ?? candidateList[candidateList.length - 1];
}

/**
 * Generates 3-5 smart suggestions of compatible emojis when a combination fails.
 */
function generateSuggestions(
  leftCodepoint: string,
  rightCodepoint: string,
  metadata: EmojiMetadata
): Array<{ character: string; name: string }> {
  const leftData = metadata.data[leftCodepoint];
  const rightData = metadata.data[rightCodepoint];

  const candidateCodepoints = new Set<string>();

  // Gather compatible emojis from left
  if (leftData?.combinations) {
    for (const cp of Object.keys(leftData.combinations)) {
      candidateCodepoints.add(cp);
    }
  }

  // Gather compatible emojis from right
  if (rightData?.combinations) {
    for (const cp of Object.keys(rightData.combinations)) {
      candidateCodepoints.add(cp);
    }
  }

  // Sort candidate emojis by combination abundance and gBoard order
  const scored = Array.from(candidateCodepoints)
    .filter((cp) => metadata.data[cp])
    .map((cp) => {
      const data = metadata.data[cp];
      const comboCount = Object.keys(data.combinations || {}).length;
      return {
        codepoint: cp,
        character: data.emoji,
        name: data.alt,
        score: comboCount * 10 - (data.gBoardOrder || 999),
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((s) => ({
    character: s.character,
    name: s.name,
  }));
}

/**
 * Mixes two emojis together.
 * - Resolves inputs via resolveEmoji
 * - Looks up combinations symmetrically
 * - Returns latest combination with optional base64 image data
 * - If not found, generates 3-5 smart suggestions
 */
export async function mixEmojis(
  leftInput: string,
  rightInput: string,
  includeImageData = true,
  metadata?: EmojiMetadata
): Promise<MixResponse> {
  const meta = metadata ?? getMetadata();

  const leftResolved = resolveEmoji(leftInput, meta);
  if (!leftResolved) {
    return {
      success: false,
      error: `Could not resolve left emoji: "${leftInput}". Try providing an emoji character (🐱), name (cat), or hex codepoint (1f431).`,
    };
  }

  const rightResolved = resolveEmoji(rightInput, meta);
  if (!rightResolved) {
    return {
      success: false,
      error: `Could not resolve right emoji: "${rightInput}". Try providing an emoji character (🔥), name (fire), or hex codepoint (1f525).`,
    };
  }

  const combo = findCombination(leftResolved.codepoint, rightResolved.codepoint, meta);

  if (!combo) {
    const suggestions = generateSuggestions(
      leftResolved.codepoint,
      rightResolved.codepoint,
      meta
    );
    return {
      success: false,
      error: `No Emoji Kitchen combination found between ${leftResolved.character} (${leftResolved.alt}) and ${rightResolved.character} (${rightResolved.alt}).`,
      suggestions,
    };
  }

  let imageData: string | undefined;
  if (includeImageData) {
    imageData = await fetchImageBase64(combo.gStaticUrl);
  }

  const result: MixResult = {
    leftEmoji: {
      character: leftResolved.character,
      name: leftResolved.alt,
      codepoint: leftResolved.codepoint,
    },
    rightEmoji: {
      character: rightResolved.character,
      name: rightResolved.alt,
      codepoint: rightResolved.codepoint,
    },
    gStaticUrl: combo.gStaticUrl,
    alt: combo.alt,
    date: combo.date,
    isLatest: combo.isLatest ?? true,
    gBoardOrder: combo.gBoardOrder,
    ...(imageData
      ? {
          imageData,
          dataUrl: `data:image/png;base64,${imageData}`,
        }
      : {}),
  };

  return {
    success: true,
    data: result,
  };
}

/**
 * Returns all valid combinations for a base emoji, optionally filtered and paginated.
 */
export async function getCombinations(
  input: string,
  filterQuery?: string,
  limit?: number,
  metadata?: EmojiMetadata
): Promise<CombinationsResult> {
  const meta = metadata ?? getMetadata();

  const resolved = resolveEmoji(input, meta);
  if (!resolved) {
    throw new Error(
      `Could not resolve base emoji: "${input}". Provide a valid emoji character, name, or codepoint.`
    );
  }

  const baseData = meta.data[resolved.codepoint];
  if (!baseData) {
    throw new Error(`Emoji metadata not found for codepoint "${resolved.codepoint}".`);
  }

  const effectiveLimit = Math.max(1, limit ?? DEFAULT_COMBINATIONS_LIMIT);
  const filterNorm = filterQuery?.trim().toLowerCase();

  // Find all partner codepoints that have a combination with base
  const partnerCodepoints = new Set<string>();

  if (baseData.combinations) {
    for (const partnerCp of Object.keys(baseData.combinations)) {
      partnerCodepoints.add(partnerCp);
    }
  }

  // Also check symmetrical partner entries
  for (const [otherCp, otherData] of Object.entries(meta.data)) {
    if (otherData.combinations && otherData.combinations[resolved.codepoint]) {
      partnerCodepoints.add(otherCp);
    }
  }

  interface ComboPartner {
    character: string;
    name: string;
    codepoint: string;
    gStaticUrl: string;
    date?: string;
    alt?: string;
    gBoardOrder: number;
  }

  const allCombinations: ComboPartner[] = [];

  for (const partnerCp of partnerCodepoints) {
    const partnerData = meta.data[partnerCp];
    if (!partnerData) continue;

    const combo = findCombination(resolved.codepoint, partnerCp, meta);
    if (!combo) continue;

    // Filter check
    if (filterNorm) {
      const matchName = partnerData.alt.toLowerCase().includes(filterNorm);
      const matchChar = partnerData.emoji === filterNorm;
      const matchCp = partnerCp.includes(filterNorm);
      const matchKeyword = (partnerData.keywords || []).some((kw) =>
        kw.toLowerCase().includes(filterNorm)
      );

      if (!matchName && !matchChar && !matchCp && !matchKeyword) {
        continue;
      }
    }

    allCombinations.push({
      character: partnerData.emoji,
      name: partnerData.alt,
      codepoint: partnerData.emojiCodepoint,
      gStaticUrl: combo.gStaticUrl,
      date: combo.date,
      alt: combo.alt,
      gBoardOrder: partnerData.gBoardOrder ?? 9999,
    });
  }

  // Sort by keyboard order
  allCombinations.sort((a, b) => a.gBoardOrder - b.gBoardOrder);

  return {
    baseEmoji: {
      character: baseData.emoji,
      name: baseData.alt,
      codepoint: baseData.emojiCodepoint,
    },
    totalCombinations: allCombinations.length,
    combinations: allCombinations.slice(0, effectiveLimit).map((c) => ({
      character: c.character,
      name: c.name,
      codepoint: c.codepoint,
      gStaticUrl: c.gStaticUrl,
      date: c.date,
      alt: c.alt,
    })),
  };
}

/**
 * Returns a random valid combination. If inputEmoji is provided, chooses a random compatible partner.
 */
export async function getRandomCombination(
  inputEmoji?: string,
  includeImageData = true,
  metadata?: EmojiMetadata
): Promise<MixResult> {
  const meta = metadata ?? getMetadata();

  if (inputEmoji) {
    const resolved = resolveEmoji(inputEmoji, meta);
    if (!resolved) {
      throw new Error(`Could not resolve input emoji: "${inputEmoji}".`);
    }

    const baseData = meta.data[resolved.codepoint];
    const partnerKeys = Object.keys(baseData?.combinations || {});
    if (partnerKeys.length === 0) {
      throw new Error(`No available combinations for emoji: "${inputEmoji}".`);
    }

    const randomPartner = partnerKeys[Math.floor(Math.random() * partnerKeys.length)];
    const mix = await mixEmojis(resolved.codepoint, randomPartner, includeImageData, meta);
    if (mix.success) {
      return mix.data;
    }
    throw new Error(`Failed to generate combination: ${mix.error}`);
  }

  // Pick completely random pair
  const candidateKeys = meta.knownSupportedEmoji.filter(
    (cp) => meta.data[cp] && Object.keys(meta.data[cp].combinations || {}).length > 0
  );

  if (candidateKeys.length === 0) {
    throw new Error("No supported emojis with combinations found in metadata.");
  }

  const randomLeft = candidateKeys[Math.floor(Math.random() * candidateKeys.length)];
  const partners = Object.keys(meta.data[randomLeft].combinations);
  const randomRight = partners[Math.floor(Math.random() * partners.length)];

  const mix = await mixEmojis(randomLeft, randomRight, includeImageData, meta);
  if (mix.success) {
    return mix.data;
  }

  throw new Error(`Failed to generate random combination: ${mix.error}`);
}

/**
 * Returns a curated list of featured emojis categorized for quick discovery.
 */
export function getFeaturedEmojis(): FeaturedCategory[] {
  return [
    {
      category: "Smileys & Emotion",
      emojis: [
        { character: "😀", name: "grinning" },
        { character: "😂", name: "joy" },
        { character: "🥹", name: "face_holding_back_tears" },
        { character: "🥳", name: "partying_face" },
        { character: "🤯", name: "exploding_head" },
        { character: "😭", name: "sob" },
        { character: "🤠", name: "face_with_cowboy_hat" },
        { character: "🤖", name: "robot_face" },
        { character: "👻", name: "ghost" },
        { character: "💀", name: "skull" },
        { character: "💩", name: "hankey" },
      ],
    },
    {
      category: "Animals & Nature",
      emojis: [
        { character: "🐱", name: "cat" },
        { character: "🐶", name: "dog" },
        { character: "🦊", name: "fox_face" },
        { character: "🦁", name: "lion_face" },
        { character: "🐸", name: "frog" },
        { character: "🦄", name: "unicorn_face" },
        { character: "🐙", name: "octopus" },
        { character: "🐢", name: "turtle" },
        { character: "🦉", name: "owl" },
        { character: "🦋", name: "butterfly" },
      ],
    },
    {
      category: "Food & Drink",
      emojis: [
        { character: "☕", name: "coffee" },
        { character: "🍕", name: "pizza" },
        { character: "🍔", name: "hamburger" },
        { character: "🥑", name: "avocado" },
        { character: "🍓", name: "strawberry" },
        { character: "🍦", name: "icecream" },
        { character: "🍩", name: "doughnut" },
        { character: "🌮", name: "taco" },
        { character: "🍿", name: "popcorn" },
      ],
    },
    {
      category: "Objects & Magic",
      emojis: [
        { character: "🪄", name: "magic_wand" },
        { character: "🔥", name: "fire" },
        { character: "❤️", name: "heart" },
        { character: "⚡", name: "zap" },
        { character: "🌟", name: "star2" },
        { character: "🌈", name: "rainbow" },
        { character: "💎", name: "gem" },
        { character: "🔮", name: "crystal_ball" },
        { character: "🎈", name: "balloon" },
      ],
    },
    {
      category: "Activities & Symbols",
      emojis: [
        { character: "🚀", name: "rocket" },
        { character: "🛸", name: "flying_saucer" },
        { character: "🎮", name: "video_game" },
        { character: "🎨", name: "art" },
        { character: "💯", name: "100" },
        { character: "⚠️", name: "warning" },
        { character: "🏆", name: "trophy" },
        { character: "🎲", name: "game_die" },
      ],
    },
  ];
}
