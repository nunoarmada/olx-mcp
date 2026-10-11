import { BrowserSource } from '../base/scraper.interface.js';
import { BaseOlxScraper } from './base-olx.scraper.js';

/**
 * OLX Portugal. Id extraction and listing lookup are identical across domains
 * and live in BaseOlxScraper; only the domain binding differs.
 */
export class OLXPTScraper extends BaseOlxScraper {
  constructor(browser: BrowserSource) {
    super('olx.pt', browser);
  }
}
