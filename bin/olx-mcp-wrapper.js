#!/usr/bin/env node

import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = resolve(__dirname, '../dist/index.js');

// process.execPath is the node running this wrapper. A bare 'node' is looked up
// on PATH, which GUI clients such as Claude Desktop often launch without (nvm,
// Volta, Homebrew installs), and then the server never starts.
// Arguments (--version, --help) are forwarded; the server handles them itself.
const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('error', error => {
  console.error('Failed to start olx-mcp server:', error);
  process.exit(1);
});

// Forward signals to child process
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

// Exit with same code as child; a child killed by a signal has no code.
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
