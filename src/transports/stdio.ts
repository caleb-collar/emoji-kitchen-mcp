import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Readable, Writable } from "node:stream";
import { loadMetadata } from "../data/loader.js";
import { createEmojiKitchenServer } from "../server.js";

/**
 * Controller returned by startStdioServer.
 */
export interface StdioServerController {
  server: McpServer;
  transport: StdioServerTransport;
  close: () => Promise<void>;
  shutdown: () => Promise<void>;
}

/**
 * Options for starting the stdio server.
 */
export interface StdioServerOptions {
  server?: McpServer;
  stdin?: Readable;
  stdout?: Writable;
  instructions?: string;
  directiveMode?: string;
}

/**
 * Starts the Emoji Kitchen MCP server using stdio transport.
 * All logging is strictly redirected to stderr (console.error) to protect stdout for JSON-RPC messages.
 *
 * @param options Optional configuration options or an existing McpServer instance.
 * @returns A controller object with server, transport, close, and shutdown methods.
 */
export async function startStdioServer(
  options?: StdioServerOptions | McpServer
): Promise<StdioServerController> {
  // Route all logging strictly to stderr to prevent stdout corruption
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalDebug = console.debug;

  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);
  console.warn = (...args: unknown[]) => console.error(...args);
  console.debug = (...args: unknown[]) => console.error(...args);

  // Pre-load emoji metadata
  await loadMetadata();

  let server: McpServer;
  let stdin: Readable | undefined;
  let stdout: Writable | undefined;

  if (options && "connect" in options && typeof options.connect === "function") {
    server = options as McpServer;
  } else if (options && typeof options === "object") {
    const opts = options as StdioServerOptions;
    server =
      opts.server ??
      createEmojiKitchenServer({
        instructions: opts.instructions,
        directiveMode: opts.directiveMode,
      });
    stdin = opts.stdin;
    stdout = opts.stdout;
  } else {
    server = createEmojiKitchenServer();
  }

  const transport = new StdioServerTransport(stdin, stdout);

  await server.connect(transport);
  console.error("Emoji Kitchen MCP server running on stdio");

  let isClosed = false;
  const close = async (): Promise<void> => {
    if (isClosed) return;
    isClosed = true;

    try {
      await server.close();
    } catch {
      // Ignore errors if already closed
    }

    try {
      await transport.close();
    } catch {
      // Ignore errors if already closed
    }

    // Restore original console methods
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.debug = originalDebug;
  };

  return {
    server,
    transport,
    close,
    shutdown: close,
  };
}
