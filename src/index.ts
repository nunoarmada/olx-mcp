#!/usr/bin/env node

import { readFileSync, realpathSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OLXMCPServer } from './core/server.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Handle --version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(version);
  process.exit(0);
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
OLX MCP Server v${version}
A Model Context Protocol server for searching OLX listings across Europe.

Usage: olx-mcp

This server is designed to be used with Claude Desktop.
Configure it in your claude_desktop_config.json:

{
  "mcpServers": {
    "olx-mcp": {
      "command": "olx-mcp"
    }
  }
}

Supports domains: olx.pt, olx.pl, olx.bg, olx.ro, olx.ua
  `);
  process.exit(0);
}

async function main() {
  const server = new OLXMCPServer({
    name: 'olx-mcp-server',
    version: version,
    headless: true,
  });

  // Register scrapers and tools; the browser launches on the first tool call
  await server.initialize();

  // Set up graceful shutdown. Several triggers can fire together (stdin 'end'
  // then 'close', or a signal during shutdown); they share one run so none of
  // them exits before the browser has actually closed.
  let shuttingDown: Promise<void> | undefined;
  const shutdown = (code: number): Promise<void> => {
    shuttingDown ??= server
      .cleanup()
      .catch(error => console.error('Cleanup failed:', error))
      .then(() => process.exit(code));
    return shuttingDown;
  };
  const cleanup = () => shutdown(0);

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  // The MCP client ends the session by closing our stdin. Without this the
  // open browser connection keeps the process, and Chromium, alive.
  process.stdin.on('end', cleanup);
  process.stdin.on('close', cleanup);
  process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    void shutdown(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    void shutdown(1);
  });

  // Create and connect STDIO transport
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error('OLX MCP Server started successfully'); // Log to stderr to avoid interfering with STDIO
  } catch (error) {
    console.error('Failed to start server:', error);
    await shutdown(1);
  }
}

// Only run if this file is executed directly. pathToFileURL percent-encodes the
// path and handles Windows drive letters, and realpath resolves the symlinks
// npm installs; a hand-built `file://` string matched none of these, and the
// server then exited without ever starting.
const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    // argv[1] need not exist on disk (a loader may rewrite it); compare as given.
    return import.meta.url === pathToFileURL(entry).href;
  }
};

if (isEntryPoint()) {
  main().catch(async error => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}
