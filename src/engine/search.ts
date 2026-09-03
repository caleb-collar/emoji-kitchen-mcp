import { getMetadata } from "../data/loader.js";
import type { EmojiMetadata, SearchResult } from "../data/types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

/**
 * Strips variation selectors from emoji strings.
 */
function stripVariationSelectors(str: string): string {
  return str.replace(/[\ufe0e\ufe0f]/g, "");
}

/**
 * Escapes regex special characters in a search string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Searches for emojis matching the query string with ranked relevance:
 * 1. Exact character / codepoint / alt name
 * 2. Exact keyword match
 * 3. Name prefix / word boundary match
 * 4. Name substring match
 * 5. Keyword prefix / word boundary match
 * 6. Keyword substring match
 *
 * Low context footprint: returns only { character, name, codepoint, comboCount }.
 * Default limit is 10, max limit is 30.
 */
export function searchEmojis(
  query: string,
  limit?: number,
  metadata?: EmojiMetadata
): SearchResult[] {
  if (!query || typeof query !== "string") {
    return [];
  }

  let cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return [];
  }

  // Strip wrapping colons (e.g. ":cat:" -> "cat")
  if (cleanQuery.startsWith(":") && cleanQuery.endsWith(":") && cleanQuery.length > 2) {
    cleanQuery = cleanQuery.slice(1, -1).trim();
  }

  const effectiveLimit = Math.min(
    Math.max(1, limit ?? DEFAULT_LIMIT),
    MAX_LIMIT
  );

  const meta = metadata ?? getMetadata();
  const strippedQuery = stripVariationSelectors(cleanQuery);
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(cleanQuery)}`, "i");

  interface ScoredCandidate {
    result: SearchResult;
    score: number;
    gBoardOrder: number;
  }

  const scoredCandidates: ScoredCandidate[] = [];

  for (const emojiData of Object.values(meta.data)) {
    const rawEmoji = emojiData.emoji;
    const strippedEmoji = stripVariationSelectors(rawEmoji);
    const alt = emojiData.alt;
    const normAlt = alt.toLowerCase();
    const spaceAlt = normAlt.replace(/[-_]+/g, " ");
    const codepoint = emojiData.emojiCodepoint.toLowerCase();
    const keywords = emojiData.keywords || [];
    const comboCount = Object.keys(emojiData.combinations || {}).length;

    let baseScore = 0;

    // Tier 1: Exact character match
    if (rawEmoji === cleanQuery || strippedEmoji === strippedQuery) {
      baseScore = 1000;
    }
    // Tier 2: Exact codepoint match (e.g. "1f431" or "2764-fe0f")
    else if (
      codepoint === cleanQuery ||
      codepoint.replace(/-fe0f$/, "") === cleanQuery ||
      `u${codepoint}` === cleanQuery
    ) {
      baseScore = 950;
    }
    // Tier 3: Exact name match
    else if (
      normAlt === cleanQuery ||
      spaceAlt === cleanQuery ||
      normAlt.replace(/_/g, "") === cleanQuery
    ) {
      baseScore = 900;
    }
    // Tier 4: Exact keyword match
    else if (
      keywords.some(
        (kw) =>
          kw.toLowerCase() === cleanQuery ||
          kw.toLowerCase().replace(/_/g, " ") === cleanQuery
      )
    ) {
      baseScore = 800;
    }
    // Tier 5: Name starts with query or word boundary in name
    else if (
      normAlt.startsWith(cleanQuery) ||
      spaceAlt.startsWith(cleanQuery)
    ) {
      baseScore = 700;
    } else if (wordBoundaryRegex.test(spaceAlt)) {
      baseScore = 650;
    }
    // Tier 6: Substring match in name
    else if (normAlt.includes(cleanQuery) || spaceAlt.includes(cleanQuery)) {
      baseScore = 550;
    }
    // Tier 7: Keyword starts with query or word boundary in keyword
    else if (
      keywords.some((kw) => {
        const lowerKw = kw.toLowerCase();
        const spaceKw = lowerKw.replace(/_/g, " ");
        return (
          lowerKw.startsWith(cleanQuery) ||
          spaceKw.startsWith(cleanQuery) ||
          wordBoundaryRegex.test(spaceKw)
        );
      })
    ) {
      baseScore = 450;
    }
    // Tier 8: Substring match in keyword
    else if (keywords.some((kw) => kw.toLowerCase().includes(cleanQuery))) {
      baseScore = 300;
    }

    if (baseScore > 0) {
      // Tie-breakers: combination abundance, shorter name, and gBoard keyboard order
      const finalScore =
        baseScore +
        comboCount * 0.01 -
        normAlt.length * 0.001 -
        (emojiData.gBoardOrder || 9999) * 0.00001;

      scoredCandidates.push({
        result: {
          character: rawEmoji,
          name: alt,
          codepoint: emojiData.emojiCodepoint,
          comboCount,
        },
        score: finalScore,
        gBoardOrder: emojiData.gBoardOrder || 9999,
      });
    }
  }

  // Sort candidates descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  return scoredCandidates.slice(0, effectiveLimit).map((c) => c.result);
}
