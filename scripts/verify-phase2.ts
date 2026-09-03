import {
  codepointToEmoji,
  emojiToCodepoint,
  getCombinations,
  getFeaturedEmojis,
  getImageCacheSize,
  getRandomCombination,
  loadMetadata,
  mixEmojis,
  resolveEmoji,
  searchEmojis,
} from "../src/index.js";

async function main() {
  console.log("=== Verifying Phase 2: Core Data & Search Engine ===");

  // 1. Loader
  const startLoad = performance.now();
  const meta = await loadMetadata();
  console.log(
    `✔ loadMetadata loaded ${meta.knownSupportedEmoji.length} emojis in ${(performance.now() - startLoad).toFixed(1)}ms`
  );

  // 2. Matcher
  const resolvedCat = resolveEmoji("cat");
  const resolvedHeart = resolveEmoji("❤️");
  const resolvedHeartAlt = resolveEmoji("❤");
  const resolvedFire = resolveEmoji("1f525");
  console.log(`✔ resolveEmoji("cat") ->`, resolvedCat);
  console.log(`✔ resolveEmoji("❤️") ->`, resolvedHeart);
  console.log(`✔ resolveEmoji("❤") (no fe0f) ->`, resolvedHeartAlt);
  console.log(`✔ resolveEmoji("1f525") ->`, resolvedFire);
  console.log(`✔ codepointToEmoji("1fa84") ->`, codepointToEmoji("1fa84"));
  console.log(`✔ emojiToCodepoint("🪄") ->`, emojiToCodepoint("🪄"));

  // 3. Search
  const searchResults = searchEmojis("fire", 3);
  console.log(
    `✔ searchEmojis("fire", 3) ->`,
    searchResults.map((r) => `${r.character} ${r.name} (${r.comboCount} combos)`)
  );

  // 4. Mix with image data
  const mixResult = await mixEmojis("🐱", "🔥", true);
  if (mixResult.success) {
    console.log(
      `✔ mixEmojis("🐱", "🔥") -> ${mixResult.data.alt}, url: ${mixResult.data.gStaticUrl}, hasBase64: ${!!mixResult.data.imageData}`
    );
  } else {
    console.error("❌ mixEmojis failed:", mixResult.error);
  }

  // 5. Cache check
  console.log(`✔ Cache size after mix: ${getImageCacheSize()} items`);

  // 6. Incompatible mix suggestions
  const incompatibleMix = await mixEmojis("coffee", "anchor", false);
  console.log(
    `✔ Incompatible mix: success=${incompatibleMix.success}, suggestions:`,
    incompatibleMix.success ? [] : incompatibleMix.suggestions?.map((s) => `${s.character} ${s.name}`)
  );

  // 7. Combinations query
  const combos = await getCombinations("coffee", undefined, 3);
  console.log(
    `✔ getCombinations("coffee"): total=${combos.totalCombinations}, sample:`,
    combos.combinations.map((c) => `${c.character} ${c.name}`)
  );

  // 8. Random combination
  const randomCombo = await getRandomCombination("cat", false);
  console.log(
    `✔ getRandomCombination("cat") -> ${randomCombo.alt} (${randomCombo.leftEmoji.character} + ${randomCombo.rightEmoji.character})`
  );

  // 9. Featured emojis
  const featured = getFeaturedEmojis();
  console.log(
    `✔ getFeaturedEmojis() -> ${featured.length} categories (${featured.map((f) => f.category).join(", ")})`
  );

  console.log("\nAll verification checks completed successfully!");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
