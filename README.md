# OLX MCP Server

Why search for e-waste in your area by yourself if Claude can do it for you?

100% AI slop.

## Features

- 🌍 **Multi-Domain Support**: Search across 5 OLX domains (Portugal, Poland, Bulgaria, Romania, Ukraine)
- 🔍 **Search Listings**: Search with filters for category, location, price range, and sorting
- 📋 **Listing Details**: Get detailed information about specific listings including seller info
- 🎭 **Browser Automation**: Reliable web scraping using Playwright

<img width="739" height="858" alt="Screenshot 2025-09-02 at 22 47 54" src="https://github.com/user-attachments/assets/c6fee7a4-fa84-4ca5-9eb0-7dc8a1ed6c58" />

## Installation

### 📋 Claude Desktop Configuration

1. **Locate your Claude Desktop config file:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add the OLX MCP server to your configuration:**

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "npx",
      "args": ["olx-mcp"]
    }
  }
}
```

1. **Restart Claude Desktop** to load the new configuration.

### 🔄 Alternative: Global Installation

If you prefer to install globally:

```bash
npm install -g olx-mcp
```

Then use this config:

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "olx-mcp"
    }
  }
}
```

### 📦 Development: From Source

```bash
git clone https://github.com/nunoarmada/olx-mcp.git
cd olx-mcp
npm install
npm run build
```

Use this config for development:

```json
{
  "mcpServers": {
    "olx-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/olx-mcp/dist/index.js"]
    }
  }
}
```

### 🐳 Remote server (container)

The `Dockerfile` wraps the stdio server with [supergateway](https://github.com/supercorp-ai/supergateway)
and serves MCP over Streamable HTTP on port 8000 (`/mcp`, health check at `/healthz`).
Images are published to `ghcr.io/nunoarmada/olx-mcp` on every push to `main`.

```bash
docker run --rm -p 8000:8000 ghcr.io/nunoarmada/olx-mcp:latest
```

The server has no authentication of its own; put it behind a proxy that enforces it.

## Usage

Once configured, you can use the following tools in your MCP client:

### Search Listings

Search for listings on any supported OLX domain with various filters:

```
Can you search for "apartments" in "Lisboa" on OLX Portugal with a maximum price of 1000 euros?
```

```
Search for "telefon" in "warszawa" on OLX Poland with prices between 100-500 PLN?
```

**Parameters:**

- `domain` (required): OLX domain ('olx.pt', 'olx.pl', 'olx.bg', 'olx.ro', 'olx.ua')
- `query` (optional): Search term
- `category` (optional): Category filter
- `location` (optional): Location filter
- `minPrice` (optional): Minimum price
- `maxPrice` (optional): Maximum price
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page
- `sortBy` (default: 'relevance'): Sort order ('relevance', 'date', 'price-asc', 'price-desc')

### Listing Details

Get detailed information about a specific listing from any supported domain:

```
Can you get the details for listing "ABC123" from OLX Portugal?
```

```
Show me details for listing "XYZ789" from OLX Poland including images?
```

```
What does this listing say? https://www.olx.pt/d/anuncio/...-IDabc123.html
```

**Parameters:**

- `domain` (required): OLX domain ('olx.pt', 'olx.pl', 'olx.bg', 'olx.ro', 'olx.ua')
- `listingId` (optional): The ID of a listing returned by a search in the same session
- `url` (optional): The listing's own page URL on the same domain, e.g. a link you pasted. Works for listings no search has returned. One of `listingId` or `url` is required.
- `includeImages` (default: true): Include the listing's gallery image URLs
- `includeSellerInfo` (default: true): Include seller information

## Development

### Scripts

- `npm run build` - Build the TypeScript project
- `npm run dev` - Run in development mode with hot reload
- `npm start` - Run the built server
- `npm test` - Run the test suite
- `npm run ci` - Lint, format check, type-check, tests with coverage, and build
- `npm run clean` - Clean build artifacts

### Releasing

Releases are automated. Pushing a `v*` tag triggers `.github/workflows/release.yml`,
which runs the full CI pipeline, publishes to npm (with provenance), and creates
the GitHub Release:

```bash
npm version patch   # or minor/major; creates the version commit + v-tag
git push origin main --follow-tags
```

Do **not** run `npm publish` manually — CI publishes on the tag push, so a local
publish always fails with "cannot publish over previously published versions".
Verify with `gh run list` (green "Release" run) and `gh release view vX.Y.Z`.

## Troubleshooting

### MCP Inspector

For debugging MCP communication, you can use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT License - see LICENSE file for details.
