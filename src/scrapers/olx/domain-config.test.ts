import { describe, it, expect } from 'vitest';
import { getDomainConfig } from './domain-config.js';

const searchPath = (domain: Parameters<typeof getDomainConfig>[0]) =>
  getDomainConfig(domain).urlPatterns.searchPath;

describe('searchPath', () => {
  it('folds Portuguese accents in locations and queries', () => {
    expect(searchPath('olx.pt')('Setúbal', 'Câmara fotográfica')).toBe(
      '/setubal/q-camara-fotografica/'
    );
    expect(searchPath('olx.pt')('São João da Madeira')).toBe('/sao-joao-da-madeira/');
  });

  it('still folds letters Unicode does not decompose', () => {
    expect(searchPath('olx.pl')('Łódź', 'rower')).toBe('/lodz/q-rower/');
  });

  it('folds Romanian comma-below letters', () => {
    expect(searchPath('olx.ro')('Timișoara')).toBe('/timisoara/');
  });

  it('keeps Cyrillic letters intact, percent-encoded', () => {
    // "й" decomposes under NFD; its mark must survive, unlike a Latin accent's.
    expect(searchPath('olx.ua')(undefined, 'мийка')).toBe(`/ads/q-${encodeURIComponent('мийка')}/`);
  });

  it('drops punctuation from locations so it cannot reach the query or fragment', () => {
    expect(searchPath('olx.pt')('lisboa?x=1#top')).toBe('/lisboax1top/');
    expect(searchPath('olx.pt')('../porto')).toBe('/porto/');
  });

  it('falls back to the all-ads path when a location slugs to nothing', () => {
    expect(searchPath('olx.pt')('???', 'mesa')).toBe('/ads/q-mesa/');
  });

  it('builds the location-only and query-only forms', () => {
    expect(searchPath('olx.pt')('Lisboa')).toBe('/lisboa/');
    expect(searchPath('olx.pt')(undefined, 'mesa')).toBe('/ads/q-mesa/');
    expect(searchPath('olx.pt')()).toBe('/ads/');
  });
});
