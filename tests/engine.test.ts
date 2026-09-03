import { beforeAll, describe, expect, it } from "vitest";
import {
  clearImageCache,
  codepointToEmoji,
  emojiToCodepoint,
  getCachedImage,
  getCombinations,
  getFeaturedEmojis,
  getImageCacheSize,
  getMetadata,
  getRandomCombination,
  loadMetadata,
  MAX_IMAGE_CACHE_SIZE,
  mixEmojis,
  resolveEmoji,
  searchEmojis,
  setCachedImage,
} from "../src/index.js";

describe("Phase 2: Core Data & Search Engine", () => {
  beforeAll(async () => {
    // Load metadata once before running the test suite
    const metadata = await loadMetadata();
    expect(metadata).toBeDefined();
    expect(metadata.knownSupportedEmoji.length).toBeGreaterThan(500);
  });

  describe("Metadata Loader (loader.ts)", () => {
    it("should return the cached metadata singleton from getMetadata()", () => {
      const metadata = getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata.data["1f431"]).toBeDefined(); // Cat
      expect(metadata.data["1f431"].alt).toBe("cat");
      expect(metadata.data["1f431"].emoji).toBe("🐱");
    });

    it("should return identical instance on repeated loadMetadata calls", async () => {
      const meta1 = await loadMetadata();
      const meta2 = await loadMetadata();
      expect(meta1).toBe(meta2);
    });
  });

  describe("LRU Image Cache (cache.ts)", () => {
    it("should store and retrieve image buffers", () => {
      clearImageCache();
      const url = "https://example.com/test.png";
      const buffer = Buffer.from("fake-png-data");

      expect(getCachedImage(url)).toBeUndefined();
      setCachedImage(url, buffer);
      expect(getCachedImage(url)).toEqual(buffer);
    });

    it("should enforce the 500-item maximum capacity with LRU eviction", () => {
      clearImageCache();

      // Insert 505 items
      for (let i = 0; i < MAX_IMAGE_CACHE_SIZE + 5; i++) {
        setCachedImage(`https://example.com/img_${i}.png`, Buffer.from(`data_${i}`));
      }

      expect(getImageCacheSize()).toBe(MAX_IMAGE_CACHE_SIZE);
      // Items 0 through 4 should have been evicted
      expect(getCachedImage("https://example.com/img_0.png")).toBeUndefined();
      expect(getCachedImage("https://example.com/img_4.png")).toBeUndefined();
      // Items 5 through 504 should exist
      expect(getCachedImage("https://example.com/img_5.png")).toBeDefined();
      expect(getCachedImage(`https://example.com/img_${MAX_IMAGE_CACHE_SIZE + 4}.png`)).toBeDefined();
    });

    it("should refresh LRU order on access", () => {
      clearImageCache();

      setCachedImage("https://example.com/item1.png", Buffer.from("1"));
      setCachedImage("https://example.com/item2.png", Buffer.from("2"));

      // Access item1 to make item2 the least recently used
      getCachedImage("https://example.com/item1.png");

      // Fill cache up to capacity with new items
      for (let i = 3; i <= MAX_IMAGE_CACHE_SIZE + 1; i++) {
        setCachedImage(`https://example.com/item${i}.png`, Buffer.from(`${i}`));
      }

      // item2 was evicted before item1
      expect(getCachedImage("https://example.com/item2.png")).toBeUndefined();
      expect(getCachedImage("https://example.com/item1.png")).toBeDefined();
    });
  });

  describe("Matcher & Resolvers (matcher.ts)", () => {
    it("should convert codepoints to printable emojis", () => {
      expect(codepointToEmoji("1f431")).toBe("🐱");
      expect(codepointToEmoji("1F431")).toBe("🐱");
      expect(codepointToEmoji("u1f431")).toBe("🐱");
      expect(codepointToEmoji("U+1F431")).toBe("🐱");
      expect(codepointToEmoji("2764-fe0f")).toBe("❤️");
      expect(codepointToEmoji("2615")).toBe("☕");
      expect(codepointToEmoji("")).toBe("");
    });

    it("should convert emojis to codepoints", () => {
      expect(emojiToCodepoint("🐱")).toBe("1f431");
      expect(emojiToCodepoint("☕")).toBe("2615");
      expect(emojiToCodepoint("❤️")).toBe("2764-fe0f");
    });

    it("should resolve emojis from raw Unicode characters", () => {
      const cat = resolveEmoji("🐱");
      expect(cat).toEqual({
        codepoint: "1f431",
        character: "🐱",
        alt: "cat",
      });

      const fire = resolveEmoji("🔥");
      expect(fire).toEqual({
        codepoint: "1f525",
        character: "🔥",
        alt: "fire",
      });
    });

    it("should handle variation selectors (with and without fe0f)", () => {
      // Red heart with fe0f
      const heartWithFe0f = resolveEmoji("❤️");
      expect(heartWithFe0f).toBeDefined();
      expect(heartWithFe0f?.codepoint).toBe("2764-fe0f");

      // Red heart without fe0f (\u2764)
      const heartWithoutFe0f = resolveEmoji("❤");
      expect(heartWithoutFe0f).toBeDefined();
      expect(heartWithoutFe0f?.codepoint).toBe("2764-fe0f");

      // Relaxed face 263a vs 263a-fe0f
      const relaxed = resolveEmoji("263a");
      expect(relaxed).toBeDefined();
      expect(relaxed?.codepoint).toBe("263a-fe0f");

      const relaxedFull = resolveEmoji("263a-fe0f");
      expect(relaxedFull).toBeDefined();
      expect(relaxedFull?.codepoint).toBe("263a-fe0f");
    });

    it("should resolve emojis from hex codepoint strings", () => {
      expect(resolveEmoji("1f431")?.alt).toBe("cat");
      expect(resolveEmoji("1F431")?.alt).toBe("cat");
      expect(resolveEmoji("u1f431")?.alt).toBe("cat");
      expect(resolveEmoji("U+1F431")?.alt).toBe("cat");
      expect(resolveEmoji("2764-fe0f")?.alt).toBe("heart");
      expect(resolveEmoji("2615")?.alt).toBe("coffee");
    });

    it("should resolve emojis from names and shortcodes", () => {
      expect(resolveEmoji("cat")?.character).toBe("🐱");
      expect(resolveEmoji(":cat:")?.character).toBe("🐱");
      expect(resolveEmoji("fire")?.character).toBe("🔥");
      expect(resolveEmoji(":fire:")?.character).toBe("🔥");
      expect(resolveEmoji("magic_wand")?.character).toBe("🪄");
      expect(resolveEmoji("magic wand")?.character).toBe("🪄");
      expect(resolveEmoji(":magic_wand:")?.character).toBe("🪄");
    });

    it("should return null for invalid or unsupported inputs", () => {
      expect(resolveEmoji("")).toBeNull();
      expect(resolveEmoji("   ")).toBeNull();
      expect(resolveEmoji("not_an_emoji_12345")).toBeNull();
    });
  });

  describe("Emoji Search Engine (search.ts)", () => {
    it("should prioritize exact matches at rank #1", () => {
      const catResults = searchEmojis("cat");
      expect(catResults.length).toBeGreaterThan(0);
      expect(catResults[0].character).toBe("🐱");
      expect(catResults[0].name).toBe("cat");

      const fireResults = searchEmojis("fire");
      expect(fireResults.length).toBeGreaterThan(0);
      expect(fireResults[0].character).toBe("🔥");
      expect(fireResults[0].name).toBe("fire");
    });

    it("should support search by emoji character", () => {
      const results = searchEmojis("🐱");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].character).toBe("🐱");
    });

    it("should support search by codepoint hex", () => {
      const results = searchEmojis("1f431");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].character).toBe("🐱");
    });

    it("should return low context footprint { character, name, codepoint, comboCount }", () => {
      const results = searchEmojis("coffee");
      expect(results.length).toBeGreaterThan(0);
      const top = results[0];
      expect(top).toHaveProperty("character");
      expect(top).toHaveProperty("name");
      expect(top).toHaveProperty("codepoint");
      expect(top).toHaveProperty("comboCount");
      expect(typeof top.comboCount).toBe("number");
      expect(top.comboCount).toBeGreaterThan(0);
    });

    it("should respect limit with default 10 and max 30", () => {
      const defaultResults = searchEmojis("face");
      expect(defaultResults.length).toBeLessThanOrEqual(10);

      const customResults = searchEmojis("face", 5);
      expect(customResults.length).toBeLessThanOrEqual(5);

      const maxResults = searchEmojis("face", 100);
      expect(maxResults.length).toBeLessThanOrEqual(30);
    });

    it("should return empty array for empty or whitespace query", () => {
      expect(searchEmojis("")).toEqual([]);
      expect(searchEmojis("   ")).toEqual([]);
    });
  });

  describe("Mixer & Combinations (mixer.ts)", () => {
    it("should mix two valid emojis symmetrically without fetching image when includeImageData is false", async () => {
      const mix1 = await mixEmojis("cat", "fire", false);
      expect(mix1.success).toBe(true);
      if (!mix1.success) return;

      expect(mix1.data.gStaticUrl).toContain("u1f431_u1f525.png");
      expect(mix1.data.leftEmoji.character).toBe("🐱");
      expect(mix1.data.rightEmoji.character).toBe("🔥");
      expect(mix1.data.imageData).toBeUndefined();

      // Reverse order (fire + cat)
      const mix2 = await mixEmojis("fire", "cat", false);
      expect(mix2.success).toBe(true);
      if (!mix2.success) return;
      expect(mix2.data.gStaticUrl).toBe(mix1.data.gStaticUrl);
    });

    it("should fetch and cache base64 image data when includeImageData is true", async () => {
      const mix = await mixEmojis("🐱", "🔥", true);
      expect(mix.success).toBe(true);
      if (!mix.success) return;

      expect(mix.data.gStaticUrl).toBeDefined();
      expect(mix.data.imageData).toBeDefined();
      expect(typeof mix.data.imageData).toBe("string");
      expect(mix.data.imageData!.length).toBeGreaterThan(100);
      expect(mix.data.dataUrl).toContain("data:image/png;base64,");

      // Verify cached
      const cached = getCachedImage(mix.data.gStaticUrl);
      expect(cached).toBeDefined();
      expect(cached).toBeInstanceOf(Buffer);
    });

    it("should return helpful error and 3-5 suggestions for incompatible emojis", async () => {
      // Coffee and anchor are verified to have no combination together
      const mix = await mixEmojis("coffee", "anchor", false);
      expect(mix.success).toBe(false);
      if (mix.success) return;

      expect(mix.error).toContain("No Emoji Kitchen combination found");
      expect(mix.suggestions).toBeDefined();
      expect(mix.suggestions!.length).toBeGreaterThanOrEqual(3);
      expect(mix.suggestions!.length).toBeLessThanOrEqual(5);
      expect(mix.suggestions![0]).toHaveProperty("character");
      expect(mix.suggestions![0]).toHaveProperty("name");
    });

    it("should return error if an emoji cannot be resolved", async () => {
      const mix = await mixEmojis("cat", "invalid_emoji_xyz", false);
      expect(mix.success).toBe(false);
      if (!mix.success) {
        expect(mix.error).toContain("Could not resolve right emoji");
      }
    });

    it("should query combinations for a base emoji with getCombinations", async () => {
      const result = await getCombinations("coffee", undefined, 15);
      expect(result.baseEmoji.character).toBe("☕");
      expect(result.baseEmoji.name).toBe("coffee");
      expect(result.totalCombinations).toBeGreaterThan(50);
      expect(result.combinations.length).toBe(15);
      expect(result.combinations[0]).toHaveProperty("character");
      expect(result.combinations[0]).toHaveProperty("gStaticUrl");
    });

    it("should filter combinations with filterQuery in getCombinations", async () => {
      const result = await getCombinations("cat", "heart", 10);
      expect(result.combinations.length).toBeGreaterThan(0);
      const partner = result.combinations[0];
      expect(partner.name.includes("heart") || partner.character === "❤️").toBe(true);
    });

    it("should return a random combination with getRandomCombination", async () => {
      const randomGeneral = await getRandomCombination(undefined, false);
      expect(randomGeneral).toHaveProperty("gStaticUrl");
      expect(randomGeneral.leftEmoji).toBeDefined();
      expect(randomGeneral.rightEmoji).toBeDefined();

      const randomForCat = await getRandomCombination("🐱", false);
      expect(randomForCat).toHaveProperty("gStaticUrl");
      expect(
        randomForCat.leftEmoji.character === "🐱" || randomForCat.rightEmoji.character === "🐱"
      ).toBe(true);
    });

    it("should return curated featured emojis with getFeaturedEmojis", () => {
      const featured = getFeaturedEmojis();
      expect(featured.length).toBe(5);

      const categories = featured.map((f) => f.category);
      expect(categories).toContain("Smileys & Emotion");
      expect(categories).toContain("Animals & Nature");
      expect(categories).toContain("Food & Drink");
      expect(categories).toContain("Objects & Magic");
      expect(categories).toContain("Activities & Symbols");

      // Verify that all featured emojis resolve against metadata
      const meta = getMetadata();
      for (const cat of featured) {
        expect(cat.emojis.length).toBeGreaterThanOrEqual(5);
        for (const item of cat.emojis) {
          const resolved = resolveEmoji(item.character, meta);
          expect(resolved, `Failed to resolve featured emoji: ${item.character} (${item.name})`).not.toBeNull();
        }
      }
    });
  });
});
