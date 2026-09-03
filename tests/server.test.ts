import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEmojiKitchenServer,
  initializeEmojiKitchenServer,
  loadMetadata,
} from "../src/index.js";

describe("Phase 3: MCP Server & Tool Definitions", () => {
  let client: Client;
  let serverTransport: InstanceType<typeof InMemoryTransport>;
  let clientTransport: InstanceType<typeof InMemoryTransport>;
  let serverInstance: ReturnType<typeof createEmojiKitchenServer>;

  beforeAll(async () => {
    // Ensure metadata is loaded
    await loadMetadata();

    // Create server and client linked via in-memory transport
    serverInstance = createEmojiKitchenServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await serverInstance.connect(serverTransport);

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: { prompts: {}, resources: {}, tools: {} } }
    );
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await serverInstance.close();
  });

  describe("Server Initialization", () => {
    it("createEmojiKitchenServer should instantiate McpServer with defaults", () => {
      const s = createEmojiKitchenServer();
      expect(s).toBeDefined();
      expect(s.server).toBeDefined();
    });

    it("createEmojiKitchenServer should accept custom name and version", () => {
      const s = createEmojiKitchenServer({
        name: "custom-kitchen",
        version: "2.5.0",
      });
      expect(s).toBeDefined();
    });

    it("initializeEmojiKitchenServer should ensure metadata is loaded and return server", async () => {
      const s = await initializeEmojiKitchenServer();
      expect(s).toBeDefined();
      expect(s.server).toBeDefined();
    });

    it("should broadcast server instructions upon initialization", () => {
      const instructions = client.getInstructions();
      expect(instructions).toBeDefined();
      expect(instructions).toContain("Emoji Kitchen MCP Server provides official Google Emoji Kitchen sticker mashups");
      expect(instructions).toContain("mix_emojis");
    });
  });

  describe("Tool Listing", () => {
    it("should list all 5 registered tools with correct schemas and descriptions", async () => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);

      const toolNames = tools.map((t) => t.name).sort();
      expect(toolNames).toEqual([
        "get_combinations",
        "get_random_combination",
        "list_featured_emojis",
        "mix_emojis",
        "search_emojis",
      ]);

      // Verify search_emojis tool
      const searchTool = tools.find((t) => t.name === "search_emojis");
      expect(searchTool?.description).toContain("Search for emojis");
      expect(searchTool?.inputSchema.properties).toHaveProperty("query");
      expect(searchTool?.inputSchema.properties).toHaveProperty("limit");

      // Verify mix_emojis tool
      const mixTool = tools.find((t) => t.name === "mix_emojis");
      expect(mixTool?.description).toContain("Mix two emojis together");
      expect(mixTool?.inputSchema.properties).toHaveProperty("left_emoji");
      expect(mixTool?.inputSchema.properties).toHaveProperty("right_emoji");
      expect(mixTool?.inputSchema.properties).toHaveProperty("include_image_data");

      // Verify get_combinations tool
      const combosTool = tools.find((t) => t.name === "get_combinations");
      expect(combosTool?.description).toContain("compatible partner emojis");
      expect(combosTool?.inputSchema.properties).toHaveProperty("emoji");
      expect(combosTool?.inputSchema.properties).toHaveProperty("query");
      expect(combosTool?.inputSchema.properties).toHaveProperty("limit");

      // Verify get_random_combination tool
      const randomTool = tools.find((t) => t.name === "get_random_combination");
      expect(randomTool?.description).toContain("random");
      expect(randomTool?.inputSchema.properties).toHaveProperty("emoji");
      expect(randomTool?.inputSchema.properties).toHaveProperty("include_image_data");

      // Verify list_featured_emojis tool
      const featuredTool = tools.find((t) => t.name === "list_featured_emojis");
      expect(featuredTool?.description).toContain("curated featured emojis");
      expect(featuredTool?.inputSchema.properties).toHaveProperty("category");
    });
  });

  describe("Tool: search_emojis", () => {
    it("should find matching emojis and return concise text format", async () => {
      const res = await client.callTool({
        name: "search_emojis",
        arguments: { query: "cat" },
      });

      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      expect(textBlock.type).toBe("text");
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Found");
        expect(textBlock.text).toContain("🐱");
        expect(textBlock.text).toContain("1f431");
      }
    });

    it("should respect the limit parameter", async () => {
      const res = await client.callTool({
        name: "search_emojis",
        arguments: { query: "face", limit: 3 },
      });

      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        const lines = textBlock.text.split("\n").filter((l) => l.startsWith("- "));
        expect(lines.length).toBeLessThanOrEqual(3);
      }
    });

    it("should return a friendly message when no results match", async () => {
      const res = await client.callTool({
        name: "search_emojis",
        arguments: { query: "thisisnotanemojinamexyz999" },
      });

      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("No emojis found matching");
      }
    });
  });

  describe("Tool: mix_emojis", () => {
    it("should mix two emojis and return markdown details and CDN URL without image data when include_image_data is false", async () => {
      const res = await client.callTool({
        name: "mix_emojis",
        arguments: {
          left_emoji: "🐱",
          right_emoji: "🔥",
          include_image_data: false,
        },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      expect(textBlock.type).toBe("text");
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Emoji Kitchen Mashup");
        expect(textBlock.text).toContain("🐱");
        expect(textBlock.text).toContain("🔥");
        expect(textBlock.text).toContain("gstatic.com");
      }
    });

    it("should return both image content block and markdown text when include_image_data is true", async () => {
      const res = await client.callTool({
        name: "mix_emojis",
        arguments: {
          left_emoji: "cat",
          right_emoji: "fire",
          include_image_data: true,
        },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content.length).toBeGreaterThanOrEqual(2);

      const imageBlock = res.content.find((c) => c.type === "image");
      expect(imageBlock).toBeDefined();
      if (imageBlock && imageBlock.type === "image") {
        expect(imageBlock.mimeType).toBe("image/png");
        expect(imageBlock.data.length).toBeGreaterThan(100);
      }

      const textBlock = res.content.find((c) => c.type === "text");
      expect(textBlock).toBeDefined();
      if (textBlock && textBlock.type === "text") {
        expect(textBlock.text).toContain("Emoji Kitchen Mashup");
        expect(textBlock.text).toContain("gstatic.com");
      }
    });

    it("should return helpful suggestions when a combination does not exist", async () => {
      const res = await client.callTool({
        name: "mix_emojis",
        arguments: {
          left_emoji: "coffee",
          right_emoji: "anchor",
          include_image_data: false,
        },
      });

      expect(res.isError).toBe(true);
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("No Emoji Kitchen combination found");
        expect(textBlock.text).toContain("Suggestions");
      }
    });

    it("should return error message when input emoji is invalid", async () => {
      const res = await client.callTool({
        name: "mix_emojis",
        arguments: {
          left_emoji: "totally_invalid_emoji_123",
          right_emoji: "cat",
          include_image_data: false,
        },
      });

      expect(res.isError).toBe(true);
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Could not resolve left emoji");
      }
    });
  });

  describe("Tool: get_combinations", () => {
    it("should return compatible combinations for a base emoji", async () => {
      const res = await client.callTool({
        name: "get_combinations",
        arguments: { emoji: "🐱", limit: 5 },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Compatible Combinations for 🐱");
        expect(textBlock.text).toContain("Total combinations available");
        const lines = textBlock.text.split("\n").filter((l) => l.startsWith("- "));
        expect(lines.length).toBeLessThanOrEqual(5);
      }
    });

    it("should filter partner emojis by query", async () => {
      const res = await client.callTool({
        name: "get_combinations",
        arguments: { emoji: "cat", query: "fire" },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("fire");
      }
    });

    it("should handle invalid emoji gracefully", async () => {
      const res = await client.callTool({
        name: "get_combinations",
        arguments: { emoji: "not_a_valid_emoji_xyz" },
      });

      expect(res.isError).toBe(true);
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Could not resolve base emoji");
      }
    });
  });

  describe("Tool: get_random_combination", () => {
    it("should return a random combination without image data", async () => {
      const res = await client.callTool({
        name: "get_random_combination",
        arguments: { include_image_data: false },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Random Emoji Kitchen Mashup");
        expect(textBlock.text).toContain("gstatic.com");
      }
    });

    it("should return a random combination for a specific base emoji", async () => {
      const res = await client.callTool({
        name: "get_random_combination",
        arguments: { emoji: "cat", include_image_data: false },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("cat");
      }
    });

    it("should return image block when include_image_data is true", async () => {
      const res = await client.callTool({
        name: "get_random_combination",
        arguments: { emoji: "🐱", include_image_data: true },
      });

      expect(res.isError).toBeFalsy();
      const imageBlock = res.content.find((c) => c.type === "image");
      expect(imageBlock).toBeDefined();
      if (imageBlock && imageBlock.type === "image") {
        expect(imageBlock.mimeType).toBe("image/png");
      }
    });
  });

  describe("Tool: list_featured_emojis", () => {
    it("should return all curated categories by default", async () => {
      const res = await client.callTool({
        name: "list_featured_emojis",
        arguments: {},
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Smileys & Emotion");
        expect(textBlock.text).toContain("Animals & Nature");
        expect(textBlock.text).toContain("Food & Drink");
        expect(textBlock.text).toContain("Objects & Magic");
        expect(textBlock.text).toContain("Activities & Symbols");
      }
    });

    it("should filter by specific category", async () => {
      const res = await client.callTool({
        name: "list_featured_emojis",
        arguments: { category: "Food & Drink" },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("Food & Drink");
        expect(textBlock.text).not.toContain("Smileys & Emotion");
      }
    });

    it("should report available categories when filter matches nothing", async () => {
      const res = await client.callTool({
        name: "list_featured_emojis",
        arguments: { category: "Intergalactic" },
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const textBlock = res.content[0];
      if (textBlock.type === "text") {
        expect(textBlock.text).toContain("No featured category matching");
        expect(textBlock.text).toContain("Available categories");
      }
    });
  });

  describe("Resources", () => {
    it("should list emoji-kitchen://stats and emoji-kitchen://featured resources", async () => {
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThanOrEqual(2);

      const uris = resources.map((r) => r.uri);
      expect(uris).toContain("emoji-kitchen://stats");
      expect(uris).toContain("emoji-kitchen://featured");
    });

    it("should read emoji-kitchen://stats resource with accurate JSON data", async () => {
      const res = await client.readResource({ uri: "emoji-kitchen://stats" });
      expect(res.contents).toHaveLength(1);
      expect(res.contents[0].uri).toBe("emoji-kitchen://stats");
      expect(res.contents[0].mimeType).toBe("application/json");

      const text = (res.contents[0] as { text: string }).text;
      const stats = JSON.parse(text);

      expect(stats.version).toBe("1.0.0");
      expect(stats.totalEmojis).toBeGreaterThan(500);
      expect(stats.totalCombinations).toBeGreaterThan(100000);
    });

    it("should read emoji-kitchen://featured resource with valid categories", async () => {
      const res = await client.readResource({ uri: "emoji-kitchen://featured" });
      expect(res.contents).toHaveLength(1);
      expect(res.contents[0].uri).toBe("emoji-kitchen://featured");
      expect(res.contents[0].mimeType).toBe("application/json");

      const text = (res.contents[0] as { text: string }).text;
      const categories = JSON.parse(text);

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThanOrEqual(4);
      expect(categories[0]).toHaveProperty("category");
      expect(categories[0]).toHaveProperty("emojis");
    });
  });

  describe("Prompts", () => {
    it("should list the mashup-brainstorm prompt", async () => {
      const { prompts } = await client.listPrompts();
      const prompt = prompts.find((p) => p.name === "mashup-brainstorm");
      expect(prompt).toBeDefined();
      expect(prompt?.description).toContain("Guides LLM");
      expect(prompt?.arguments).toHaveLength(1);
      expect(prompt?.arguments?.[0].name).toBe("theme");
    });

    it("should generate messages for mashup-brainstorm prompt", async () => {
      const res = await client.getPrompt({
        name: "mashup-brainstorm",
        arguments: { theme: "halloween spooky party" },
      });

      expect(res.messages).toHaveLength(1);
      const userMessage = res.messages[0];
      expect(userMessage.role).toBe("user");
      if (userMessage.content.type === "text") {
        expect(userMessage.content.text).toContain("halloween spooky party");
        expect(userMessage.content.text).toContain("mix_emojis");
      }
    });
  });
});
