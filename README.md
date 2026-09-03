# 🧑🍳 Emoji Kitchen MCP Server

A high-performance, headless [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that brings Google's **Emoji Kitchen** to Large Language Models and AI agents. Search, query, and synthesize over **100,000+ unique emoji combinations** across **619 supported base emojis** with instant resolution and multimodal image returns.

---

## 📑 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Performance](#architecture--performance)
- [Tools Reference](#tools-reference)
  - [`search_emojis`](#1-search_emojis)
  - [`mix_emojis`](#2-mix_emojis)
  - [`get_combinations`](#3-get_combinations)
  - [`get_random_combination`](#4-get_random_combination)
  - [`list_featured_emojis`](#5-list_featured_emojis)
- [Resources & Prompts](#resources--prompts)
  - [Resources](#resources)
  - [Prompts](#prompts)
- [Client Integration Guides](#client-integration-guides)
  - [Claude Desktop](#claude-desktop)
  - [Cursor IDE](#cursor-ide)
  - [Antigravity](#antigravity)
  - [Generic SSE / Remote Integration (OpenWebUI, LibreChat, cURL)](#generic-sse--remote-integration)
- [Hosting & Deployment](#hosting--deployment)
  - [Docker & Docker Compose](#docker--docker-compose)
  - [Cloud Hosting (Fly.io, Railway, Render)](#cloud-hosting)
  - [CLI Flags & Environment Variables](#cli-flags--environment-variables)
- [Development & Testing](#development--testing)
- [Credits & Attribution](#credits--attribution)

---

## Overview

[Google Emoji Kitchen](https://emojipedia.org/emoji-kitchen/) allows users to merge two emojis into custom hybrid stickers (e.g. 🐱 + 🔥 = 🐱‍🔥 *Flaming Cat*). 

**`emoji-kitchen-mcp`** exposes this entire visual synthesis engine through standard MCP primitives:
- **Headless & Embedded:** Zero browser automation or puppeteer dependencies.
- **Rich Multimodal Outputs:** Direct base64 PNG images for vision-capable LLMs plus Google gStatic CDN URLs for markdown-friendly rendering.
- **Context-Engineered:** Response payloads are optimized for minimal token overhead while preserving maximum expressive detail.

---

## Key Features

- **⚡ Dual Transports:**
  - **`stdio`**: Standard input/output transport for local desktop integrations (Claude Desktop, Cursor, local CLI).
  - **`HTTP / SSE`**: Server-Sent Events with session management and CORS for remote agent orchestration, cloud containers, and web chat clients.
- **🖼️ Multimodal Vision Outputs:**
  - Returns raw base64-encoded PNG image data directly within the MCP tool response.
  - Automatically caches remote assets with an in-memory LRU cache to reduce latency and bandwidth.
  - Provides fallback Google gStatic CDN links and descriptive markdown text.
- **🧠 Token-Optimized Footprint:**
  - Search and combination results return compact, high-signal listings (`emoji`, `:shortcode:`, `codepoint`, and combo availability counts).
  - Prevents prompt context bloat during multi-step mashup exploration.
- **🏎️ Sub-15ms Resolution:**
  - Fully in-memory indexing of 100k+ combinations and 619 emojis.
  - Symmetrical bidirectional lookup ensures `cat + fire` and `fire + cat` resolve seamlessly.
- **📦 Offline-Ready & Bundled Metadata:**
  - Ships with offline data caching (`data/metadata.json`), with automatic background fetching if the local file is missing.

---

## Architecture & Performance

```
+-------------------------------------------------------+
|                   MCP Host Client                     |
|  (Claude Desktop / Cursor / Antigravity / OpenWebUI)   |
+-------------------------------------------------------+
                           │
                 stdio or HTTP / SSE
                           │
                           ▼
+-------------------------------------------------------+
|               emoji-kitchen-mcp Server                |
|  ┌──────────────────┐         ┌────────────────────┐  |
|  │ Stdio Controller │         │ Express SSE App    │  |
|  └────────┬─────────┘         └─────────┬──────────┘  |
|           └──────────────┬──────────────┘             |
|                          ▼                            |
|             ┌─────────────────────────┐               |
|             │      McpServer SDK      │               |
|             └────────────┬────────────┘               |
|                          ▼                            |
|        Tools, Prompts & Resource Registrations        |
|  ┌──────────────────────────────────────────────────┐ |
|  │ • search_emojis         • emoji-kitchen://stats  │ |
|  │ • mix_emojis            • emoji-kitchen://feat...│ |
|  │ • get_combinations      • mashup-brainstorm      │ |
|  │ • get_random_combination                         │ |
|  │ • list_featured_emojis                           │ |
|  └───────────────────────┬──────────────────────────┘ |
|                          ▼                            |
|  ┌──────────────────────────────────────────────────┐ |
|  │               Core Mashup Engine                 │ |
|  │  Matcher · Search · Mixer · LRU Image Cache      │ |
|  └───────────────────────┬──────────────────────────┘ |
|                          ▼                            |
|  ┌──────────────────────────────────────────────────┐ |
|  │          Local Bundled metadata.json             │ |
|  │   (619 emojis · 100,000+ indexed combinations)   │ |
|  └──────────────────────────────────────────────────┘ |
+-------------------------------------------------------+
```

---

## Tools Reference

### 1. `search_emojis`

Search for emojis by natural language keyword, common name, or unicode character. Designed for low token overhead.

#### Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | `string` | **Yes** | — | Search term (e.g. `'cat'`, `'fire'`, `'heart'`, `'🐱'`). |
| `limit` | `number` | No | `10` | Maximum results to return (1–30). |

#### Example Call
```json
{
  "name": "search_emojis",
  "arguments": {
    "query": "robot",
    "limit": 5
  }
}
```

#### Example Output
```text
Found 1 emoji(s) matching "robot":
- 🤖 :robot: (1f916) — 189 combinations
```

---

### 2. `mix_emojis`

Mix two emojis into an Emoji Kitchen combination. Returns both a base64 PNG image (for LLMs with vision capabilities) and formatted Markdown containing CDN links and metadata. If the pair is not supported, intelligent suggestions are automatically provided.

#### Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `left_emoji` | `string` | **Yes** | — | Left emoji: character (`'🐱'`), name (`'cat'`), or hex codepoint (`'1f431'`). |
| `right_emoji` | `string` | **Yes** | — | Right emoji: character (`'🚀'`), name (`'rocket'`), or hex codepoint (`'1f680'`). |
| `include_image_data` | `boolean` | No | `true` | When `true`, downloads and returns base64 PNG data in the response. |

#### Example Call
```json
{
  "name": "mix_emojis",
  "arguments": {
    "left_emoji": "🐱",
    "right_emoji": "🚀",
    "include_image_data": true
  }
}
```

#### Example Response
```json
{
  "content": [
    {
      "type": "image",
      "data": "iVBORw0KGgoAAAANSUhEUgAAA...",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "### Emoji Kitchen Mashup: 🐱 + 🚀\n\n- **Result**: cat face and rocket\n- **Left Emoji**: 🐱 (`cat`, `1f431`)\n- **Right Emoji**: 🚀 (`rocket`, `1f680`)\n- **Date Added**: 20220815\n- **Image URL**: https://www.gstatic.com/android/keyboard/emojikitchen/20220815/u1f431/u1f431_u1f680.png"
    }
  ]
}
```

---

### 3. `get_combinations`

Explore all valid partner emojis compatible with a given base emoji. Useful for discovering what mixes can be created before calling `mix_emojis`.

#### Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `emoji` | `string` | **Yes** | — | Base emoji character, shortcode, or codepoint. |
| `query` | `string` | No | — | Optional search filter for partner emojis (e.g. `'face'`, `'cat'`, `'star'`). |
| `limit` | `number` | No | `15` | Max partner emojis to return (1–100). |

#### Example Call
```json
{
  "name": "get_combinations",
  "arguments": {
    "emoji": "🥑",
    "query": "cat",
    "limit": 5
  }
}
```

#### Example Output
```text
### Compatible Combinations for 🥑 :avocado:
Total combinations available: 182
Showing 1 partner emoji(s) matching "cat":

- 🐱 :cat: (1f431) → avocado and cat face
```

---

### 4. `get_random_combination`

Generate a surprise, valid Emoji Kitchen mashup. Can pick two completely random emojis or fix one base emoji and choose a random compatible partner.

#### Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `emoji` | `string` | No | — | Optional base emoji. If omitted, picks two completely random emojis. |
| `include_image_data` | `boolean` | No | `true` | Fetch and return base64 PNG data. |

#### Example Call
```json
{
  "name": "get_random_combination",
  "arguments": {
    "emoji": "🍄",
    "include_image_data": false
  }
}
```

#### Example Output
```text
### Random Emoji Kitchen Mashup: 🍄 + ✨

- **Result**: mushroom and sparkles
- **Left Emoji**: 🍄 (`mushroom`, `1f344`)
- **Right Emoji**: ✨ (`sparkles`, `2728`)
- **Date Added**: 20220815
- **Image URL**: https://www.gstatic.com/android/keyboard/emojikitchen/20220815/u1f344/u1f344_u2728.png
```

---

### 5. `list_featured_emojis`

Retrieve curated emojis categorized by visual themes. Ideal for kickstarting inspiration or presenting emoji sets to users.

#### Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `category` | `string` | No | `'all'` | Category filter (`'all'`, `'Smileys & Emotion'`, `'Animals & Nature'`, `'Food & Drink'`, `'Objects & Magic'`, `'Activities & Symbols'`). |

#### Example Call
```json
{
  "name": "list_featured_emojis",
  "arguments": {
    "category": "Food & Drink"
  }
}
```

#### Example Output
```text
### Featured Emojis

#### Food & Drink
- 🥑 :avocado:
- 🍕 :pizza:
- 🍔 :hamburger:
- 🌮 :taco:
- 🍦 :ice_cream:
- ☕ :hot_beverage:
- 🍩 :doughnut:
- 🍓 :strawberry:
```

---

## Resources & Prompts

### Resources

| URI | Description | MIME Type |
|---|---|---|
| `emoji-kitchen://stats` | Live summary of indexed emojis, total unique stickers, and total combination mappings. | `application/json` |
| `emoji-kitchen://featured` | Curated list of featured emojis and categories in JSON format. | `application/json` |

#### `emoji-kitchen://stats` Sample Payload
```json
{
  "version": "1.0.0",
  "totalEmojis": 619,
  "totalCombinations": 100256,
  "totalCombinationEntries": 100256
}
```

### Prompts

#### `mashup-brainstorm`
Guides the LLM through creating themed emoji combinations matching user concepts (e.g. *"space adventure"*, *"cyberpunk kitchen"*, *"cozy cafe"*).

- **Arguments:**
  - `theme` (`string`, required): The target theme or aesthetic concept.

---

## Client Integration Guides

### Claude Desktop

Add the server to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

#### Using Local Node:
```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/emoji-kitchen-mcp/dist/index.js", "--stdio"]
    }
  }
}
```

#### Using Docker:
```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "emoji-kitchen-mcp:latest", "node", "dist/index.js", "--stdio"]
    }
  }
}
```

---

### Cursor IDE

Add `emoji-kitchen-mcp` in Cursor via **Settings > Features > MCP**:

#### Option A: Stdio Command
```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/emoji-kitchen-mcp/dist/index.js", "--stdio"]
    }
  }
}
```

#### Option B: Remote SSE Server
Start the server with `pnpm serve` (or Docker) and point Cursor to the SSE endpoint:
```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

---

### Antigravity

Add the server to your Antigravity configuration (`~/.gemini/antigravity-cli/mcp_config.json` or `.gemini/mcp.json`):

```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "command": "node",
      "args": ["C:/Users/Caleb/DataDomain/Repos/emoji-kitchen-mcp/dist/index.js", "--stdio"]
    }
  }
}
```

Or connect via the SSE transport:
```json
{
  "mcpServers": {
    "emoji-kitchen": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

---

### Generic SSE / Remote Integration

`emoji-kitchen-mcp` provides a standard SSE transport compliant with the MCP specification.

#### 1. Start Server in SSE Mode
```bash
pnpm serve
# Server runs at http://0.0.0.0:3000
```

#### 2. Health Check
```bash
curl http://localhost:3000/health
```
```json
{
  "status": "ok",
  "service": "emoji-kitchen-mcp",
  "version": "1.0.0",
  "activeSessions": 0
}
```

#### 3. Root Discovery
```bash
curl http://localhost:3000/
```

#### 4. OpenWebUI & LibreChat
Configure your MCP gateway to connect to:
```
http://<host>:3000/sse
```
Incoming JSON-RPC POST requests are automatically routed via `/messages?sessionId=<sessionId>`.

---

## Hosting & Deployment

### Docker & Docker Compose

#### Build and Run with Docker
```bash
# Build Docker image
docker build -t emoji-kitchen-mcp .

# Run container on port 3000
docker run -d \
  --name emoji-kitchen-mcp \
  -p 3000:3000 \
  --restart unless-stopped \
  emoji-kitchen-mcp
```

#### Run with Docker Compose
```bash
docker compose up -d
```

#### Health Status
```bash
docker ps --filter "name=emoji-kitchen-mcp"
# Output shows healthy status: (healthy)
```

---

### Cloud Hosting

#### Fly.io
1. Initialize app:
   ```bash
   fly launch
   ```
2. Set configuration in `fly.toml`:
   ```toml
   app = "emoji-kitchen-mcp"
   primary_region = "ord"

   [build]
     dockerfile = "Dockerfile"

   [env]
     TRANSPORT = "sse"
     PORT = "8080"
     HOST = "0.0.0.0"

   [[services]]
     internal_port = 8080
     protocol = "tcp"

     [[services.ports]]
       handlers = ["http"]
       port = 80

     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443

     [[services.http_checks]]
       interval = "30s"
       grace_period = "5s"
       method = "get"
       path = "/health"
       timeout = "5s"
   ```
3. Deploy:
   ```bash
   fly deploy
   ```

#### Railway
1. Create a new project on [Railway.app](https://railway.app).
2. Choose **Deploy from GitHub repo**.
3. Railway automatically detects `Dockerfile`.
4. Add environment variables:
   - `PORT=3000`
   - `HOST=0.0.0.0`
   - `TRANSPORT=sse`
5. Expose public domain pointing to port `3000`.

#### Render
1. Create a new **Web Service** on [Render.com](https://render.com).
2. Select repository and choose **Docker** runtime.
3. Configure Health Check Path: `/health`.
4. Environment variables:
   - `PORT=3000`
   - `HOST=0.0.0.0`
   - `TRANSPORT=sse`

---

### CLI Flags & Environment Variables

```text
Usage:
  emoji-kitchen-mcp [options]

Options:
  --stdio              Run with stdio transport (default)
  --sse                Run HTTP/SSE server
  -p, --port <number>  Port for SSE server (default: 3000, or env PORT)
  -h, --host <string>  Host for SSE server (default: 0.0.0.0, or env HOST)
  -v, --version        Show version number
  --help, -h           Show help message
```

#### Environment Variables
| Variable | Allowed Values | Default | Description |
|---|---|---|---|
| `TRANSPORT` | `stdio`, `sse` | `stdio` | Transport protocol to use. |
| `PORT` | Number | `3000` | Port for SSE HTTP server. |
| `HOST` | String | `0.0.0.0` | Host IP binding for SSE HTTP server. |
| `NODE_ENV` | `production`, `development`, `test` | `development` | Node runtime environment. |

---

## Development & Testing

### Installation
```bash
git clone https://github.com/caleb-collar/emoji-kitchen-mcp.git
cd emoji-kitchen-mcp
pnpm install
```

### Pre-download Metadata
```bash
pnpm prepare-data
```

### Development Server (TSX)
```bash
pnpm dev
```

### Run Tests
```bash
pnpm test
```

### Production Build
```bash
pnpm build
```

### Run Production Server
```bash
# stdio mode
pnpm start

# SSE mode
pnpm serve
```

---

## Credits & Attribution

- **Google Emoji Kitchen**: Created by Google and featured in Gboard and Google Search. All emoji sticker artwork belongs to Google.
- **Data & Reverse Engineering**: Thanks to [xsalazar/emoji-kitchen](https://github.com/xsalazar/emoji-kitchen) and [xsalazar/emoji-kitchen-backend](https://github.com/xsalazar/emoji-kitchen-backend) for cataloging combinations and providing the metadata index.
- **Model Context Protocol**: Developed by Anthropic and the open-source MCP community.

---

<p align="center">
  Crafted with ❤️ for LLM mashup creativity.
</p>
