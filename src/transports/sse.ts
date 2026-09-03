import cors from "cors";
import express from "express";
import http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadMetadata } from "../data/loader.js";
import { createEmojiKitchenServer } from "../server.js";

/**
 * Information tracked for each active SSE session.
 */
export interface SseSession {
  transport: SSEServerTransport;
  server: McpServer;
}

/**
 * Options for configuring and starting the SSE HTTP server.
 */
export interface SseServerOptions {
  port?: number;
  host?: string;
}

/**
 * Instance returned by startSseServer.
 */
export interface SseServerInstance {
  server: http.Server;
  port: number;
  host: string;
  close: () => Promise<void>;
  app: express.Express;
  sessions: Map<string, SseSession>;
}

/**
 * Creates and configures the Express application for the SSE transport,
 * along with the session map.
 */
export function createSseApp(): {
  app: express.Express;
  sessions: Map<string, SseSession>;
} {
  const app = express();
  app.use(cors());

  const sessions = new Map<string, SseSession>();

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "emoji-kitchen-mcp",
      version: "1.0.0",
      activeSessions: sessions.size,
    });
  });

  // Service documentation and root information endpoint
  app.get("/", (_req, res) => {
    res.status(200).json({
      service: "emoji-kitchen-mcp",
      name: "Emoji Kitchen MCP Server",
      version: "1.0.0",
      description:
        "Model Context Protocol (MCP) server providing access to Google Emoji Kitchen combinations, search, and mashup generation.",
      status: "ok",
      activeSessions: sessions.size,
      endpoints: {
        "GET /": "Service information and endpoint documentation",
        "GET /health": "Health check returning status, version, and active session count",
        "GET /sse": "Initiate SSE stream for MCP client communication",
        "POST /messages?sessionId=<sessionId>":
          "Send client JSON-RPC messages to the server",
      },
      capabilities: {
        tools: [
          "search_emojis",
          "mix_emojis",
          "get_combinations",
          "get_random_combination",
          "list_featured_emojis",
        ],
        resources: ["emoji-kitchen://stats", "emoji-kitchen://featured"],
        prompts: ["mashup-brainstorm"],
      },
    });
  });

  // SSE stream endpoint
  app.get("/sse", async (req, res) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      const mcpServer = createEmojiKitchenServer();
      const sessionId = transport.sessionId;

      const session: SseSession = { transport, server: mcpServer };
      sessions.set(sessionId, session);

      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        sessions.delete(sessionId);
        try {
          await mcpServer.close();
        } catch {
          // Ignore close errors
        }
      };

      transport.onclose = () => {
        void cleanup();
      };

      req.on("close", () => {
        void cleanup();
      });

      await mcpServer.connect(transport);
    } catch (error) {
      console.error("Error establishing SSE connection:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to establish SSE connection" });
      }
    }
  });

  // Client JSON-RPC message endpoint
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    try {
      const parsedBody =
        req.body !== undefined && Object.keys(req.body).length > 0
          ? req.body
          : undefined;
      await session.transport.handlePostMessage(req, res, parsedBody);
    } catch (error) {
      console.error(`Error handling message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return { app, sessions };
}

/**
 * Starts the Emoji Kitchen MCP server using the HTTP/SSE transport.
 *
 * @param options Server port and host configuration.
 * @returns An object containing the HTTP server instance, actual port, host, and close function.
 */
export async function startSseServer(
  options?: { port?: number; host?: string }
): Promise<{
  server: http.Server;
  port: number;
  host: string;
  close: () => Promise<void>;
  app: express.Express;
  sessions: Map<string, SseSession>;
}> {
  // Pre-load emoji metadata
  await loadMetadata();

  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const port =
    options?.port ??
    (typeof envPort === "number" && !isNaN(envPort) && envPort >= 0
      ? envPort
      : 3000);
  const host = options?.host ?? (process.env.HOST || "0.0.0.0");

  const { app, sessions } = createSseApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort =
    typeof address === "object" && address !== null ? address.port : port;
  const actualHost =
    typeof address === "object" && address !== null ? address.address : host;

  let isClosed = false;
  const close = async (): Promise<void> => {
    if (isClosed) return;
    isClosed = true;

    // Close all active client sessions
    for (const session of Array.from(sessions.values())) {
      try {
        await session.transport.close();
      } catch {
        // Ignore close errors
      }
      try {
        await session.server.close();
      } catch {
        // Ignore close errors
      }
    }
    sessions.clear();

    // Close persistent connections immediately
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }

    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };

  return {
    server,
    port: actualPort,
    host: actualHost,
    close,
    app,
    sessions,
  };
}
