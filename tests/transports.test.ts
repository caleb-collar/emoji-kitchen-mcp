import http from "node:http";
import { PassThrough } from "node:stream";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startSseServer,
  type SseServerInstance,
  startStdioServer,
  parseArgs,
} from "../src/index.js";

describe("Phase 4: Transports & CLI Entry", () => {
  describe("SSE Transport", () => {
    let sseInstance: SseServerInstance;

    beforeAll(async () => {
      // Start SSE server on ephemeral port (0)
      sseInstance = await startSseServer({ port: 0, host: "127.0.0.1" });
    });

    afterAll(async () => {
      if (sseInstance) {
        await sseInstance.close();
      }
    });

    it("should start SSE server on an ephemeral port (port 0)", () => {
      expect(sseInstance).toBeDefined();
      expect(sseInstance.server).toBeDefined();
      expect(sseInstance.port).toBeGreaterThan(0);
      expect(sseInstance.host).toBe("127.0.0.1");
      expect(sseInstance.server.listening).toBe(true);
    });

    it("GET /health should return 200 and json with status 'ok'", async () => {
      const res = await fetch(`http://127.0.0.1:${sseInstance.port}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        status: string;
        service: string;
        version: string;
        activeSessions: number;
      };
      expect(data.status).toBe("ok");
      expect(data.service).toBe("emoji-kitchen-mcp");
      expect(data.version).toBe("1.0.0");
      expect(typeof data.activeSessions).toBe("number");
    });

    it("GET / should return service information and endpoint documentation", async () => {
      const res = await fetch(`http://127.0.0.1:${sseInstance.port}/`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        service: string;
        name: string;
        version: string;
        status: string;
        endpoints: Record<string, string>;
        capabilities: { tools: string[]; resources: string[]; prompts: string[] };
      };
      expect(data.service).toBe("emoji-kitchen-mcp");
      expect(data.version).toBe("1.0.0");
      expect(data.endpoints).toBeDefined();
      expect(data.endpoints["GET /health"]).toBeDefined();
      expect(data.endpoints["GET /sse"]).toBeDefined();
      expect(data.endpoints["POST /messages?sessionId=<sessionId>"]).toBeDefined();
      expect(data.capabilities.tools).toContain("search_emojis");
      expect(data.capabilities.tools).toContain("mix_emojis");
    });

    it("GET /sse should establish SSE headers (text/event-stream)", async () => {
      const { req, res, firstChunk } = await new Promise<{
        req: http.ClientRequest;
        res: http.IncomingMessage;
        firstChunk: string;
      }>((resolve, reject) => {
        const clientReq = http.get(
          `http://127.0.0.1:${sseInstance.port}/sse`,
          (clientRes) => {
            clientRes.setEncoding("utf8");
            clientRes.once("data", (chunk: string) => {
              resolve({
                req: clientReq,
                res: clientRes,
                firstChunk: chunk,
              });
            });
          }
        );
        clientReq.on("error", reject);
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");
      expect(res.headers["cache-control"]).toContain("no-cache");
      expect(firstChunk).toContain("event: endpoint");
      expect(firstChunk).toContain("/messages?sessionId=");

      req.destroy();
    });

    it("POST /messages should return 400 when sessionId is missing", async () => {
      const res = await fetch(`http://127.0.0.1:${sseInstance.port}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("Missing sessionId");
    });

    it("POST /messages should return 404 when sessionId is not found", async () => {
      const res = await fetch(
        `http://127.0.0.1:${sseInstance.port}/messages?sessionId=non-existent-session-id`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
        }
      );
      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("Session not found");
    });

    it("POST /messages should route to session transport when sessionId is valid", async () => {
      // Connect an SSE client to obtain a valid session ID
      const { req, firstChunk } = await new Promise<{
        req: http.ClientRequest;
        res: http.IncomingMessage;
        firstChunk: string;
      }>((resolve, reject) => {
        const clientReq = http.get(
          `http://127.0.0.1:${sseInstance.port}/sse`,
          (clientRes) => {
            clientRes.setEncoding("utf8");
            clientRes.once("data", (chunk: string) => {
              resolve({
                req: clientReq,
                res: clientRes,
                firstChunk: chunk,
              });
            });
          }
        );
        clientReq.on("error", reject);
      });

      const match = firstChunk.match(/sessionId=([a-zA-Z0-9_-]+)/);
      expect(match).not.toBeNull();
      const sessionId = match![1];

      // Verify activeSessions updated to reflect the connection
      const healthRes = await fetch(
        `http://127.0.0.1:${sseInstance.port}/health`
      );
      const healthData = (await healthRes.json()) as { activeSessions: number };
      expect(healthData.activeSessions).toBeGreaterThanOrEqual(1);

      // Post a valid message to the session
      const postRes = await fetch(
        `http://127.0.0.1:${sseInstance.port}/messages?sessionId=${sessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }),
        }
      );
      expect(postRes.status).toBe(202);

      // Clean up client connection
      req.destroy();
    });

    it("should allow a full MCP Client to connect over SSE and list tools", async () => {
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { SSEClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/sse.js"
      );

      const client = new Client(
        { name: "test-sse-client", version: "1.0.0" },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const transport = new SSEClientTransport(
        new URL(`http://127.0.0.1:${sseInstance.port}/sse`)
      );

      await client.connect(transport);

      const toolsResult = await client.listTools();
      expect(toolsResult.tools.length).toBe(5);
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain("search_emojis");
      expect(toolNames).toContain("mix_emojis");
      expect(toolNames).toContain("get_combinations");
      expect(toolNames).toContain("get_random_combination");
      expect(toolNames).toContain("list_featured_emojis");

      await client.close();
    });

    it("should shut down cleanly and reject new connections", async () => {
      // Start a dedicated temporary server to test shutdown
      const tempServer = await startSseServer({ port: 0, host: "127.0.0.1" });
      const tempPort = tempServer.port;
      expect(tempServer.server.listening).toBe(true);

      await tempServer.close();
      expect(tempServer.server.listening).toBe(false);

      // Attempting to connect should fail
      await expect(
        fetch(`http://127.0.0.1:${tempPort}/health`)
      ).rejects.toThrow();
    });
  });

  describe("Stdio Transport", () => {
    it("should start stdio server and return controller with close/shutdown", async () => {
      const stdin = new PassThrough();
      const stdout = new PassThrough();

      const stdio = await startStdioServer({ stdin, stdout });
      expect(stdio).toBeDefined();
      expect(stdio.server).toBeDefined();
      expect(stdio.transport).toBeDefined();
      expect(typeof stdio.close).toBe("function");
      expect(typeof stdio.shutdown).toBe("function");

      await stdio.close();
      stdin.destroy();
      stdout.destroy();
    });
  });

  describe("CLI Argument Parsing", () => {
    it("should parse default options when no arguments provided", () => {
      const opts = parseArgs([]);
      expect(opts.transport).toBe("stdio");
      expect(opts.port).toBe(3000);
      expect(opts.host).toBe("0.0.0.0");
      expect(opts.help).toBe(false);
      expect(opts.version).toBe(false);
    });

    it("should parse --sse and custom port and host", () => {
      const opts = parseArgs(["--sse", "-p", "8080", "--host", "127.0.0.1"]);
      expect(opts.transport).toBe("sse");
      expect(opts.port).toBe(8080);
      expect(opts.host).toBe("127.0.0.1");
    });

    it("should parse --port=9000 and --host=localhost", () => {
      const opts = parseArgs(["--port=9000", "--host=localhost"]);
      expect(opts.port).toBe(9000);
      expect(opts.host).toBe("localhost");
    });

    it("should parse -p=7000 and -h=0.0.0.0", () => {
      const opts = parseArgs(["-p=7000", "-h=0.0.0.0"]);
      expect(opts.port).toBe(7000);
      expect(opts.host).toBe("0.0.0.0");
    });

    it("should parse -h with host value", () => {
      const opts = parseArgs(["--sse", "-h", "192.168.1.1"]);
      expect(opts.host).toBe("192.168.1.1");
      expect(opts.help).toBe(false);
    });

    it("should parse --stdio flag explicitly", () => {
      const opts = parseArgs(["--stdio"]);
      expect(opts.transport).toBe("stdio");
    });

    it("should parse --help and -h without host as help flag", () => {
      expect(parseArgs(["--help"]).help).toBe(true);
      expect(parseArgs(["-h"]).help).toBe(true);
      expect(parseArgs(["-h", "--stdio"]).help).toBe(true);
    });

    it("should parse --version and -v", () => {
      expect(parseArgs(["--version"]).version).toBe(true);
      expect(parseArgs(["-v"]).version).toBe(true);
    });

    it("should respect environment variables when CLI flags are absent", () => {
      const originalEnv = { ...process.env };
      try {
        process.env.TRANSPORT = "sse";
        process.env.PORT = "9999";
        process.env.HOST = "10.0.0.1";

        const opts = parseArgs([]);
        expect(opts.transport).toBe("sse");
        expect(opts.port).toBe(9999);
        expect(opts.host).toBe("10.0.0.1");
      } finally {
        process.env = originalEnv;
      }
    });

    it("should parse --directive and -d flags", () => {
      expect(parseArgs(["--directive", "funny"]).directiveMode).toBe("funny");
      expect(parseArgs(["-d", "creative"]).directiveMode).toBe("creative");
      expect(parseArgs(["--directive=proactive"]).directiveMode).toBe("proactive");
      expect(parseArgs(["-d=strict"]).directiveMode).toBe("strict");
    });

    it("should parse --instructions and --directive-text flags", () => {
      const custom = "Use when funny or interesting";
      expect(parseArgs(["--instructions", custom]).instructions).toBe(custom);
      expect(parseArgs([`--instructions=${custom}`]).instructions).toBe(custom);
      expect(parseArgs(["--directive-text", custom]).instructions).toBe(custom);
      expect(parseArgs([`--directive-text=${custom}`]).instructions).toBe(custom);
    });

    it("should respect DIRECTIVE_MODE and DIRECTIVE_TEXT environment variables", () => {
      const originalEnv = { ...process.env };
      try {
        process.env.DIRECTIVE_MODE = "funny";
        process.env.DIRECTIVE_TEXT = "Custom instructions from env";

        const opts = parseArgs([]);
        expect(opts.directiveMode).toBe("funny");
        expect(opts.instructions).toBe("Custom instructions from env");
      } finally {
        process.env = originalEnv;
      }
    });
  });
});

