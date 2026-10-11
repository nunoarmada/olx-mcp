import { Browser, Page } from 'playwright';
import { Result, ScraperConfig } from '../../core/types.js';

export interface IScraper<TQuery, TResult> {
  scrape(query: TQuery, signal?: AbortSignal): Promise<Result<TResult>>;
  validateQuery(query: unknown): query is TQuery;
}

/**
 * A failure that repeating the operation cannot fix — a stale selector will be
 * just as stale on the third page load. retryOperation surfaces these
 * immediately instead of spending the full backoff schedule on them.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * A browser, or a function resolving one on demand. The provider form lets the
 * server launch Chromium lazily and relaunch it after a crash, while scrapers
 * built around a fixed instance keep working unchanged.
 */
export type BrowserSource = Browser | (() => Promise<Browser>);

/** Thrown when the caller's AbortSignal fires; never worth retrying. */
export class OperationCancelledError extends Error {
  constructor() {
    super('Operation cancelled');
    this.name = 'OperationCancelledError';
  }
}

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new OperationCancelledError();
};

export abstract class PlaywrightScraper<TQuery, TResult> implements IScraper<TQuery, TResult> {
  constructor(
    protected readonly config: ScraperConfig,
    protected readonly browser: BrowserSource
  ) {}

  abstract scrape(query: TQuery, signal?: AbortSignal): Promise<Result<TResult>>;
  abstract validateQuery(query: unknown): query is TQuery;

  protected async withPage<T>(fn: (page: Page) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const newPageOptions: Parameters<Browser['newPage']>[0] = {};
    if (this.config.userAgent) {
      newPageOptions.userAgent = this.config.userAgent;
    }
    throwIfAborted(signal);
    const browser = typeof this.browser === 'function' ? await this.browser() : this.browser;
    const page = await browser.newPage(newPageOptions);
    // Closing the page aborts whatever navigation or query is in flight, so a
    // cancelled request stops using the network and CPU straight away.
    const onAbort = () => {
      page.close().catch(() => {
        // Already closed by the finally block below.
      });
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      throwIfAborted(signal);
      page.setDefaultTimeout(this.config.timeout);
      return await fn(page);
    } catch (error) {
      // An abort surfaces from Playwright as "Target closed"; report it as what
      // it is so retryOperation does not retry it.
      throwIfAborted(signal);
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      // A failing close must not replace the operation's own error.
      await page.close().catch((error: unknown) => {
        console.error('Failed to close page:', error);
      });
    }
  }

  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retries,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          lastError instanceof NonRetryableError ||
          lastError instanceof OperationCancelledError ||
          attempt === maxRetries
        ) {
          throw lastError;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        throwIfAborted(signal);
      }
    }

    throw lastError!;
  }
}
