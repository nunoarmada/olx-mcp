import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { chromium, Browser } from 'playwright';

import { ToolRegistry } from './tool-registry.js';
import { SearchListingsTool } from '../tools/search/search-listings.tool.js';
import { GetListingDetailsTool } from '../tools/listing/get-listing-details.tool.js';
import { OlxScraperFactory } from '../scrapers/olx/scraper.factory.js';

export interface ServerConfig {
  readonly name: string;
  readonly version: string;
  readonly headless?: boolean;
}

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
];

export class OLXMCPServer {
  private readonly registry = new ToolRegistry();
  private readonly server: Server;
  private browserLaunch?: Promise<Browser> | undefined;
  private closed = false;
  private scraperFactory?: OlxScraperFactory | undefined;

  constructor(private readonly config: ServerConfig) {
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Registers the tools. Chromium is not started here: it launches on the
   * first tool call, so the server connects (and lists its tools) even when
   * the browser is missing, and the failure reaches the client as a tool error
   * it can show rather than a server that never comes up.
   */
  async initialize(): Promise<void> {
    if (this.scraperFactory) return;
    this.closed = false;

    this.scraperFactory = new OlxScraperFactory(() => this.getBrowser());

    this.registry
      .register(new SearchListingsTool(this.scraperFactory))
      .register(new GetListingDetailsTool(this.scraperFactory));
  }

  /**
   * The shared browser, launched on first use. A crashed or closed browser is
   * forgotten on 'disconnected', so the next call launches a fresh one instead
   * of failing every request until the server is restarted.
   */
  private getBrowser(): Promise<Browser> {
    // A tool call racing shutdown must not launch a Chromium nobody will close.
    if (this.closed) return Promise.reject(new Error('Server is shutting down'));
    if (!this.browserLaunch) {
      const launch = chromium
        .launch({ headless: this.config.headless ?? true, args: BROWSER_ARGS })
        .then(browser => {
          browser.on('disconnected', () => {
            if (this.browserLaunch === launch) this.browserLaunch = undefined;
          });
          return browser;
        });
      // A failed launch is not cached either: the next call retries it.
      launch.catch(() => {
        if (this.browserLaunch === launch) this.browserLaunch = undefined;
      });
      this.browserLaunch = launch;
    }
    return this.browserLaunch;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.registry.getAllTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;

      const tool = this.registry.get(name);
      if (!tool) {
        // An unknown tool is a protocol-level mistake, not a tool failure.
        throw new Error(`Tool not found: ${name}`);
      }

      const result = await tool.execute(args || {}, extra.signal);

      // Tool failures are returned as results so the model sees the message
      // and can correct its arguments; a thrown error reaches it only as an
      // opaque protocol error.
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: result.error.message }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    });
  }

  getServer(): Server {
    return this.server;
  }

  async cleanup(): Promise<void> {
    this.closed = true;
    if (this.scraperFactory) {
      this.scraperFactory.clearCache();
      this.scraperFactory = undefined;
      this.registry.clear();
    }
    const launch = this.browserLaunch;
    this.browserLaunch = undefined;
    if (launch) {
      // A launch that failed has nothing to close.
      const browser = await launch.catch(() => undefined);
      await browser?.close();
    }
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }
}
