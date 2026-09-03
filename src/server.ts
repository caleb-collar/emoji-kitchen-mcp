import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadMetadata } from "./data/loader.js";
import type { EmojiMetadata } from "./data/types.js";
import {
  getCombinations,
  getFeaturedEmojis,
  getRandomCombination,
  mixEmojis,
} from "./engine/mixer.js";
import { searchEmojis } from "./engine/search.js";

/**
 * Cached metadata statistics to avoid recalculating on each resource read.
 */
interface EmojiStats {
  version: string;
  totalEmojis: number;
  totalCombinations: number;
  totalCombinationEntries: number;
}

let cachedStats: EmojiStats | null = null;

function getOrComputeStats(metadata: EmojiMetadata): EmojiStats {
  if (cachedStats) {
    return cachedStats;
  }

  const seenUrls = new Set<string>();
  let totalEntries = 0;

  for (const item of Object.values(metadata.data)) {
    for (const comboList of Object.values(item.combinations || {})) {
      for (const combo of comboList) {
        seenUrls.add(combo.gStaticUrl);
        totalEntries++;
      }
    }
  }

  cachedStats = {
    version: "1.0.0",
    totalEmojis: metadata.knownSupportedEmoji.length,
    totalCombinations: seenUrls.size,
    totalCombinationEntries: totalEntries,
  };

  return cachedStats;
}

/**
 * Creates and configures an McpServer instance with all Emoji Kitchen tools,
 * prompts, and resources registered.
 */
export function createEmojiKitchenServer(options?: {
  name?: string;
  version?: string;
}): McpServer {
  const server = new McpServer({
    name: options?.name ?? "emoji-kitchen-mcp",
    version: options?.version ?? "1.0.0",
  });

  // ==========================================
  // Tool 1: search_emojis
  // ==========================================
  server.tool(
    "search_emojis",
    "Search for emojis by name, keyword, or character with low context overhead. Returns concise text format.",
    {
      query: z
        .string()
        .describe("Search term (emoji character like '🐱', name like 'cat', or keyword)"),
      limit: z
        .number()
        .int()
        .positive()
        .max(30)
        .optional()
        .default(10)
        .describe("Maximum number of results to return (default: 10, max: 30)"),
    },
    async ({ query, limit }) => {
      await loadMetadata();
      const results = searchEmojis(query, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No emojis found matching "${query}". Try searching for common emoji names (e.g. cat, dog, fire, smile) or provide an emoji character directly.`,
            },
          ],
        };
      }

      const lines = [
        `Found ${results.length} emoji(s) matching "${query}":`,
        ...results.map(
          (r) =>
            `- ${r.character} :${r.name}: (${r.codepoint}) — ${r.comboCount} combinations`
        ),
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    }
  );

  // ==========================================
  // Tool 2: mix_emojis
  // ==========================================
  server.tool(
    "mix_emojis",
    "Mix two emojis together using Google Emoji Kitchen. Returns an image and markdown details. If combination doesn't exist, provides helpful suggestions.",
    {
      left_emoji: z
        .string()
        .describe(
          "Left emoji: character (e.g. '🐱'), name (e.g. 'cat'), or hex codepoint (e.g. '1f431')"
        ),
      right_emoji: z
        .string()
        .describe(
          "Right emoji: character (e.g. '🔥'), name (e.g. 'fire'), or hex codepoint (e.g. '1f525')"
        ),
      include_image_data: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Whether to fetch and return base64-encoded PNG image data (default: true)"
        ),
    },
    async ({ left_emoji, right_emoji, include_image_data }) => {
      await loadMetadata();
      const mix = await mixEmojis(left_emoji, right_emoji, include_image_data);

      if (!mix.success) {
        let message = mix.error;
        if (mix.suggestions && mix.suggestions.length > 0) {
          message +=
            "\n\n### Suggestions\nHere are some compatible emojis you can try mixing:\n" +
            mix.suggestions.map((s) => `- ${s.character} :${s.name}:`).join("\n");
        }
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: message,
            },
          ],
        };
      }

      const { leftEmoji, rightEmoji, gStaticUrl, alt, date, imageData } =
        mix.data;
      const content: Array<
        | { type: "image"; data: string; mimeType: string }
        | { type: "text"; text: string }
      > = [];

      if (include_image_data && imageData) {
        content.push({
          type: "image" as const,
          data: imageData,
          mimeType: "image/png",
        });
      }

      const details = [
        `### Emoji Kitchen Mashup: ${leftEmoji.character} + ${rightEmoji.character}`,
        "",
        `- **Result**: ${alt}`,
        `- **Left Emoji**: ${leftEmoji.character} (\`${leftEmoji.name}\`, \`${leftEmoji.codepoint}\`)`,
        `- **Right Emoji**: ${rightEmoji.character} (\`${rightEmoji.name}\`, \`${rightEmoji.codepoint}\`)`,
        `- **Date Added**: ${date || "Unknown"}`,
        `- **Image URL**: ${gStaticUrl}`,
      ].join("\n");

      content.push({
        type: "text" as const,
        text: details,
      });

      return { content };
    }
  );

  // ==========================================
  // Tool 3: get_combinations
  // ==========================================
  server.tool(
    "get_combinations",
    "Get all compatible partner emojis for a given base emoji, with optional search filtering and pagination limit.",
    {
      emoji: z
        .string()
        .describe(
          "Base emoji: character (e.g. '🐱'), name (e.g. 'cat'), or hex codepoint (e.g. '1f431')"
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Optional search filter to find specific partner emojis (e.g. 'heart', 'face', 'fire')"
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .default(15)
        .describe(
          "Maximum number of compatible partner emojis to return (default: 15)"
        ),
    },
    async ({ emoji, query, limit }) => {
      await loadMetadata();
      try {
        const res = await getCombinations(emoji, query, limit);
        if (res.combinations.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No combinations found for ${res.baseEmoji.character} (${res.baseEmoji.name})${
                  query ? ` matching filter "${query}"` : ""
                }. Total combinations for this emoji: ${res.totalCombinations}.`,
              },
            ],
          };
        }

        const lines = [
          `### Compatible Combinations for ${res.baseEmoji.character} :${res.baseEmoji.name}:`,
          `Total combinations available: ${res.totalCombinations}`,
          `Showing ${res.combinations.length} partner emoji(s)${
            query ? ` matching "${query}"` : ""
          }:`,
          "",
          ...res.combinations.map(
            (c) =>
              `- ${c.character} :${c.name}: (${c.codepoint})${
                c.alt ? ` → ${c.alt}` : ""
              }`
          ),
        ];

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to get combinations: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // ==========================================
  // Tool 4: get_random_combination
  // ==========================================
  server.tool(
    "get_random_combination",
    "Get a random valid Emoji Kitchen mashup, optionally featuring a specific base emoji.",
    {
      emoji: z
        .string()
        .optional()
        .describe(
          "Optional base emoji to get a random compatible combination with (character, name, or codepoint)"
        ),
      include_image_data: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Whether to fetch and return base64-encoded PNG image data (default: true)"
        ),
    },
    async ({ emoji, include_image_data }) => {
      await loadMetadata();
      try {
        const result = await getRandomCombination(emoji, include_image_data);
        const content: Array<
          | { type: "image"; data: string; mimeType: string }
          | { type: "text"; text: string }
        > = [];

        if (include_image_data && result.imageData) {
          content.push({
            type: "image" as const,
            data: result.imageData,
            mimeType: "image/png",
          });
        }

        const details = [
          `### Random Emoji Kitchen Mashup: ${result.leftEmoji.character} + ${result.rightEmoji.character}`,
          "",
          `- **Result**: ${result.alt}`,
          `- **Left Emoji**: ${result.leftEmoji.character} (\`${result.leftEmoji.name}\`, \`${result.leftEmoji.codepoint}\`)`,
          `- **Right Emoji**: ${result.rightEmoji.character} (\`${result.rightEmoji.name}\`, \`${result.rightEmoji.codepoint}\`)`,
          `- **Date Added**: ${result.date || "Unknown"}`,
          `- **Image URL**: ${result.gStaticUrl}`,
        ].join("\n");

        content.push({
          type: "text" as const,
          text: details,
        });

        return { content };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to get random combination: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // ==========================================
  // Tool 5: list_featured_emojis
  // ==========================================
  server.tool(
    "list_featured_emojis",
    "List curated featured emojis categorized by theme (e.g. Smileys & Emotion, Animals & Nature, Food & Drink, Objects & Magic, Activities & Symbols).",
    {
      category: z
        .string()
        .optional()
        .default("all")
        .describe(
          "Category to filter by: 'all', or a category name like 'Smileys & Emotion', 'Animals & Nature', 'Food & Drink', 'Objects & Magic', 'Activities & Symbols'"
        ),
    },
    async ({ category }) => {
      const featured = getFeaturedEmojis();
      const filterCat = category?.trim().toLowerCase();

      let matchingCategories = featured;
      if (filterCat && filterCat !== "all") {
        matchingCategories = featured.filter((c) =>
          c.category.toLowerCase().includes(filterCat)
        );
        if (matchingCategories.length === 0) {
          const available = featured.map((c) => `"${c.category}"`).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `No featured category matching "${category}". Available categories: ${available}, or "all".`,
              },
            ],
          };
        }
      }

      const lines: string[] = ["### Featured Emojis", ""];
      for (const cat of matchingCategories) {
        lines.push(`#### ${cat.category}`);
        lines.push(
          cat.emojis.map((e) => `- ${e.character} :${e.name}:`).join("\n")
        );
        lines.push("");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n").trim(),
          },
        ],
      };
    }
  );

  // ==========================================
  // Prompt: mashup-brainstorm
  // ==========================================
  server.prompt(
    "mashup-brainstorm",
    "Guides LLM to create emoji kitchen combinations matching the theme",
    {
      theme: z
        .string()
        .describe(
          "Theme or concept to brainstorm emoji mashups for (e.g. 'space adventure', 'cozy cafe', 'cyberpunk', 'party animal')"
        ),
    },
    ({ theme }) => {
      return {
        description: `Brainstorm creative Emoji Kitchen combinations for theme: "${theme}"`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `You are an expert Emoji Kitchen chef and creative designer.`,
                `Please brainstorm emoji mashup ideas based on the theme: "${theme}".`,
                "",
                `Instructions:`,
                `1. Identify relevant emojis that fit the theme "${theme}".`,
                `2. Use the \`search_emojis\` or \`get_combinations\` tools to verify supported emojis and valid combinations.`,
                `3. Suggest 3 to 5 creative emoji pairs that can be mashed together using \`mix_emojis\`.`,
                `4. For each suggestion, explain why the combination fits the theme "${theme}" and what the visual mashup represents.`,
                `5. Provide the exact \`mix_emojis\` tool call parameters for each combination.`,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

  // ==========================================
  // Resource 1: emoji-kitchen://stats
  // ==========================================
  server.resource(
    "stats",
    "emoji-kitchen://stats",
    {
      description:
        "Statistics about available emojis and Emoji Kitchen combinations",
      mimeType: "application/json",
    },
    async (uri) => {
      const meta = await loadMetadata();
      const stats = getOrComputeStats(meta);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  );

  // ==========================================
  // Resource 2: emoji-kitchen://featured
  // ==========================================
  server.resource(
    "featured",
    "emoji-kitchen://featured",
    {
      description: "Curated featured emoji categories",
      mimeType: "application/json",
    },
    async (uri) => {
      const featured = getFeaturedEmojis();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(featured, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Initializes Emoji Kitchen metadata and creates an McpServer instance.
 */
export async function initializeEmojiKitchenServer(options?: {
  name?: string;
  version?: string;
}): Promise<McpServer> {
  await loadMetadata();
  return createEmojiKitchenServer(options);
}
