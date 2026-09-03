/**
 * Raw combination entry in Emoji Kitchen metadata.
 */
export interface EmojiCombination {
  gStaticUrl: string;
  alt: string;
  leftEmoji: string;
  leftEmojiCodepoint: string;
  rightEmoji: string;
  rightEmojiCodepoint: string;
  date: string;
  isLatest: boolean;
  gBoardOrder: number;
}

/**
 * Entry for a single emoji and all its valid combinations.
 */
export interface EmojiData {
  alt: string;
  emoji: string;
  emojiCodepoint: string;
  gBoardOrder: number;
  keywords: string[];
  category?: string;
  subcategory?: string;
  combinations: Record<string, EmojiCombination[]>;
}

/**
 * Complete metadata object containing all supported emojis and their combination graphs.
 */
export interface EmojiMetadata {
  knownSupportedEmoji: string[];
  data: Record<string, EmojiData>;
}

/**
 * Canonical representation of an emoji item.
 */
export interface EmojiItem {
  character: string;
  name: string;
  codepoint: string;
  comboCount?: number;
  keywords?: string[];
  category?: string;
  subcategory?: string;
}

/**
 * Lightweight search result with low context footprint.
 */
export interface SearchResult {
  character: string;
  name: string;
  codepoint: string;
  comboCount: number;
}

/**
 * Mixed emoji result with metadata and optional base64 image data.
 */
export interface MixResult {
  leftEmoji: {
    character: string;
    name: string;
    codepoint: string;
  };
  rightEmoji: {
    character: string;
    name: string;
    codepoint: string;
  };
  gStaticUrl: string;
  alt: string;
  date: string;
  isLatest: boolean;
  gBoardOrder?: number;
  imageData?: string; // base64-encoded PNG image data
  dataUrl?: string; // data:image/png;base64,... URI
}

/**
 * Result structure when querying available combinations for an emoji.
 */
export interface CombinationsResult {
  baseEmoji: {
    character: string;
    name: string;
    codepoint: string;
  };
  totalCombinations: number;
  combinations: Array<{
    character: string;
    name: string;
    codepoint: string;
    gStaticUrl: string;
    date?: string;
    alt?: string;
  }>;
}

/**
 * Emoji resolution result.
 */
export interface ResolvedEmoji {
  codepoint: string;
  character: string;
  alt: string;
}

/**
 * Mix response structure with success or error and suggestions.
 */
export type MixResponse =
  | {
      success: true;
      data: MixResult;
    }
  | {
      success: false;
      error: string;
      suggestions?: Array<{
        character: string;
        name: string;
        codepoint?: string;
      }>;
    };

/**
 * Featured emoji category definition.
 */
export interface FeaturedCategory {
  category: string;
  emojis: Array<{
    character: string;
    name: string;
  }>;
}
