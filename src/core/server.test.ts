import { describe, it, expect, beforeEach, vi } from 'vitest';

type Handler = (request: any, extra?: any) => Promise<any>;

// Mock modules before importing. vi.hoisted keeps these reachable from the
// hoisted vi.mock factories.
const { handlers, mockServer, mockBrowser, launch } = vi.hoisted(() => {
  const handlers = new Map<unknown, Handler>();
  const mockServer = {
    setRequestHandler: vi.fn((schema: unknown, handler: Handler) => {
      handlers.set(schema, handler);
    }),
    connect: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newPage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  const launch = vi.fn();
  return { handlers, mockServer, mockBrowser, launch };
});

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  // A regular function: the server calls this with `new`, and an arrow
  // function cannot be a constructor.
  Server: vi.fn(function () {
    return mockServer;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: Symbol('ListToolsRequestSchema'),
  CallToolRequestSchema: Symbol('CallToolRequestSchema'),
}));

vi.mock('playwright', () => ({ chromium: { launch } }));

import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { OLXMCPServer, type ServerConfig } from './server.js';

const callTool = (name: string, args: unknown, signal = new AbortController().signal) =>
  handlers.get(CallToolRequestSchema)!({ params: { name, arguments: args } }, { signal });

const getBrowser = (server: OLXMCPServer) =>
  (server as unknown as { getBrowser: () => Promise<unknown> }).getBrowser();

describe('OLXMCPServer', () => {
  let server: OLXMCPServer;
  const config: ServerConfig = { name: 'test-olx-mcp-server', version: '1.0.0-test' };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    launch.mockResolvedValue(mockBrowser);
    server = new OLXMCPServer(config);
  });

  describe('construction', () => {
    it('creates the SDK server with the configured name and version', () => {
      expect(Server).toHaveBeenCalledWith(
        { name: 'test-olx-mcp-server', version: '1.0.0-test' },
        { capabilities: { tools: {} } }
      );
      expect(server.getServer()).toBe(mockServer);
    });

    it('connects the given transport', async () => {
      const transport = { start: vi.fn(), send: vi.fn(), close: vi.fn() };
      await server.connect(transport);
      expect(mockServer.connect).toHaveBeenCalledWith(transport);
    });
  });

  describe('initialize', () => {
    it('registers both tools without launching the browser', async () => {
      await server.initialize();

      const { tools } = await handlers.get(ListToolsRequestSchema)!({});
      expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
        'searchListings',
        'getListingDetails',
      ]);
      expect(tools[0].inputSchema).toMatchObject({ type: 'object' });
      expect(launch).not.toHaveBeenCalled();
    });

    it('is idempotent', async () => {
      await server.initialize();
      await expect(server.initialize()).resolves.toBeUndefined();
    });

    it('can initialize again after cleanup', async () => {
      await server.initialize();
      await server.cleanup();
      await expect(server.initialize()).resolves.toBeUndefined();
    });
  });

  describe('tool calls', () => {
    beforeEach(async () => {
      await server.initialize();
    });

    it('rejects unknown tools as a protocol error', async () => {
      await expect(callTool('nope', {})).rejects.toThrow('Tool not found: nope');
    });

    it('returns tool failures as isError results the model can read', async () => {
      const result = await callTool('searchListings', { domain: 'olx.pt' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'At least one of query, category, or location must be provided'
      );
    });

    it('passes the request abort signal to the tool', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await callTool(
        'searchListings',
        { domain: 'olx.pt', query: 'x' },
        controller.signal
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Operation cancelled');
      expect(launch).not.toHaveBeenCalled();
    });

    it('reports a browser that cannot launch as a tool error', async () => {
      launch.mockRejectedValue(new Error("Executable doesn't exist"));

      const result = await callTool('searchListings', { domain: 'olx.pt', query: 'x' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Executable doesn't exist");
    });
  });

  describe('browser lifecycle', () => {
    it('launches headless with the sandbox-free args by default', async () => {
      await getBrowser(server);

      expect(launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining(['--no-sandbox', '--disable-dev-shm-usage']),
      });
    });

    it('passes through headless: false', async () => {
      await getBrowser(new OLXMCPServer({ ...config, headless: false }));
      expect(launch).toHaveBeenCalledWith(expect.objectContaining({ headless: false }));
    });

    it('launches once and shares the browser across calls', async () => {
      const [a, b] = await Promise.all([getBrowser(server), getBrowser(server)]);

      expect(a).toBe(mockBrowser);
      expect(b).toBe(mockBrowser);
      expect(launch).toHaveBeenCalledTimes(1);
    });

    it('relaunches after the browser disconnects', async () => {
      await getBrowser(server);
      const onDisconnected = mockBrowser.on.mock.calls.find(
        ([event]) => event === 'disconnected'
      )![1];

      onDisconnected();
      await getBrowser(server);

      expect(launch).toHaveBeenCalledTimes(2);
    });

    it('retries a launch that failed', async () => {
      launch.mockRejectedValueOnce(new Error('boom'));

      await expect(getBrowser(server)).rejects.toThrow('boom');
      await expect(getBrowser(server)).resolves.toBe(mockBrowser);
      expect(launch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    it('closes a launched browser', async () => {
      await server.initialize();
      await getBrowser(server);

      await server.cleanup();

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the browser never launched', async () => {
      await server.initialize();
      await expect(server.cleanup()).resolves.toBeUndefined();
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it('tolerates a launch that failed', async () => {
      launch.mockRejectedValue(new Error('boom'));
      await getBrowser(server).catch(() => {});

      await expect(server.cleanup()).resolves.toBeUndefined();
    });
  });
});
