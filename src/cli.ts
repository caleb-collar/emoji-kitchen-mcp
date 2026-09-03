import process from "node:process";
import { startStdioServer, type StdioServerController } from "./transports/stdio.js";
import { startSseServer, type SseServerInstance } from "./transports/sse.js";

/**
 * Parsed CLI options.
 */
export interface CliOptions {
  transport: "stdio" | "sse";
  port: number;
  host: string;
  directiveMode?: string;
  instructions?: string;
  help?: boolean;
  version?: boolean;
}

export const VERSION = "1.0.0";

export const HELP_TEXT = `Emoji Kitchen MCP Server v${VERSION}

Usage:
  emoji-kitchen-mcp [options]

Options:
  --stdio                Run with stdio transport (default)
  --sse                  Run HTTP/SSE server
  -p, --port <number>    Port for SSE server (default: 3000, or env PORT)
  -h, --host <string>    Host for SSE server (default: 0.0.0.0, or env HOST)
  -d, --directive <mode> Directive preset for LLM auto-usage:
                         standard | creative | funny | proactive | expressive | strict
  --instructions <text>  Custom system instructions broadcast to the LLM
  -v, --version          Show version number
  --help, -h             Show this help message

Environment Variables:
  TRANSPORT              Transport mode: "stdio" | "sse" (default: "stdio")
  PORT                   Port for SSE server (default: 3000)
  HOST                   Host for SSE server (default: "0.0.0.0")
  DIRECTIVE_MODE         Directive preset: standard | creative | funny | proactive | expressive | strict
  DIRECTIVE_TEXT         Custom system instructions (or MCP_INSTRUCTIONS)
`;

/**
 * Parses command line arguments and environment variables into CliOptions.
 *
 * @param argv Arguments array (excluding node and script name by default).
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const envTransport = process.env.TRANSPORT?.toLowerCase();
  const defaultTransport: "stdio" | "sse" =
    envTransport === "sse" ? "sse" : "stdio";

  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const defaultPort =
    typeof envPort === "number" && !isNaN(envPort) && envPort >= 0
      ? envPort
      : 3000;

  const defaultHost = process.env.HOST || "0.0.0.0";
  const defaultDirectiveMode = process.env.DIRECTIVE_MODE;
  const defaultInstructions =
    process.env.DIRECTIVE_TEXT || process.env.MCP_INSTRUCTIONS;

  let transport: "stdio" | "sse" = defaultTransport;
  let port = defaultPort;
  let host = defaultHost;
  let directiveMode: string | undefined = defaultDirectiveMode;
  let instructions: string | undefined = defaultInstructions;
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--stdio") {
      transport = "stdio";
    } else if (arg === "--sse") {
      transport = "sse";
    } else if (arg === "-p" || arg === "--port") {
      const next = argv[++i];
      if (next !== undefined) {
        const parsed = parseInt(next, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          port = parsed;
        }
      }
    } else if (arg.startsWith("--port=")) {
      const parsed = parseInt(arg.slice("--port=".length), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        port = parsed;
      }
    } else if (arg.startsWith("-p=")) {
      const parsed = parseInt(arg.slice("-p=".length), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        port = parsed;
      }
    } else if (arg === "--host") {
      const next = argv[++i];
      if (next !== undefined) {
        host = next;
      }
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    } else if (arg.startsWith("-h=")) {
      host = arg.slice("-h=".length);
    } else if (arg === "-d" || arg === "--directive") {
      const next = argv[++i];
      if (next !== undefined) {
        directiveMode = next;
      }
    } else if (arg.startsWith("--directive=")) {
      directiveMode = arg.slice("--directive=".length);
    } else if (arg.startsWith("-d=")) {
      directiveMode = arg.slice("-d=".length);
    } else if (arg === "--instructions" || arg === "--directive-text") {
      const next = argv[++i];
      if (next !== undefined) {
        instructions = next;
      }
    } else if (arg.startsWith("--instructions=")) {
      instructions = arg.slice("--instructions=".length);
    } else if (arg.startsWith("--directive-text=")) {
      instructions = arg.slice("--directive-text=".length);
    } else if (arg === "-h") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        host = next;
        i++;
      } else {
        help = true;
      }
    }
  }

  return { transport, port, host, directiveMode, instructions, help, version };
}

/**
 * Runs the CLI with given arguments, starting the selected transport
 * and attaching process signal handlers for clean shutdown.
 */
export async function runCli(
  args: string[] = process.argv.slice(2)
): Promise<StdioServerController | SseServerInstance | undefined> {
  const options = parseArgs(args);

  if (options.help) {
    console.log(HELP_TEXT);
    return undefined;
  }

  if (options.version) {
    console.log(VERSION);
    return undefined;
  }

  if (options.transport === "sse") {
    console.error(
      `Starting Emoji Kitchen MCP server with SSE transport on ${options.host}:${options.port}...`
    );
    if (options.directiveMode) {
      console.error(`Using directive preset: ${options.directiveMode}`);
    }
    const sse = await startSseServer({
      port: options.port,
      host: options.host,
      directiveMode: options.directiveMode,
      instructions: options.instructions,
    });
    console.error(
      `Emoji Kitchen MCP SSE server running at http://${sse.host}:${sse.port}`
    );
    console.error(`SSE endpoint: http://${sse.host}:${sse.port}/sse`);
    console.error(`Health check: http://${sse.host}:${sse.port}/health`);

    const handleSignal = async (signal: string) => {
      console.error(`Received ${signal}, shutting down...`);
      try {
        await sse.close();
      } catch (err) {
        console.error("Error during SSE shutdown:", err);
      }
      process.exit(0);
    };

    process.once("SIGINT", () => void handleSignal("SIGINT"));
    process.once("SIGTERM", () => void handleSignal("SIGTERM"));

    return sse;
  } else {
    // stdio transport (default)
    if (options.directiveMode) {
      console.error(`Using directive preset: ${options.directiveMode}`);
    }
    const stdio = await startStdioServer({
      directiveMode: options.directiveMode,
      instructions: options.instructions,
    });

    const handleSignal = async (signal: string) => {
      console.error(`Received ${signal}, shutting down...`);
      try {
        await stdio.close();
      } catch (err) {
        console.error("Error during stdio shutdown:", err);
      }
      process.exit(0);
    };

    process.once("SIGINT", () => void handleSignal("SIGINT"));
    process.once("SIGTERM", () => void handleSignal("SIGTERM"));

    return stdio;
  }
}
