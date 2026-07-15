import { describe, it, expect } from 'vitest';
import { dedupeProviders, type ProviderLike } from '../../../utils/providers.js';

describe('dedupeProviders', () => {
  it('collapses ad-tier variants into the base brand (keeps the plain variant)', () => {
    const input: ProviderLike[] = [
      { provider_id: 8, provider_name: 'Netflix', display_priority: 0 },
      { provider_id: 1796, provider_name: 'Netflix Standard with Ads', display_priority: 154 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(8);
    expect(out[0].provider_name).toBe('Netflix');
  });

  it('folds Amazon Prime Video / with Ads / Amazon Video into one via the alias map', () => {
    const input: ProviderLike[] = [
      { provider_id: 119, provider_name: 'Amazon Prime Video', display_priority: 1 },
      { provider_id: 2100, provider_name: 'Amazon Prime Video with Ads', display_priority: 203 },
      { provider_id: 10, provider_name: 'Amazon Video', display_priority: 36 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(119);
    expect(out[0].provider_name).toBe('Amazon Prime Video');
  });

  it('keeps the standalone brand over its Amazon Channel wrapper, even when the wrapper has a lower priority', () => {
    const input: ProviderLike[] = [
      { provider_id: 1968, provider_name: 'Crunchyroll Amazon Channel', display_priority: 21 },
      { provider_id: 283, provider_name: 'Crunchyroll', display_priority: 24 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(283);
    expect(out[0].provider_name).toBe('Crunchyroll');
  });

  it('folds "HBO Max Amazon Channel" into "HBO Max" via the alias map, keeping the standalone', () => {
    const input: ProviderLike[] = [
      { provider_id: 1825, provider_name: 'HBO Max Amazon Channel', display_priority: 11 },
      { provider_id: 1899, provider_name: 'HBO Max', display_priority: 28 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(1899);
    expect(out[0].provider_name).toBe('HBO Max');
  });

  it('strips the channel suffix from a channel-only brand for display', () => {
    const input: ProviderLike[] = [
      { provider_id: 2158, provider_name: 'Stingray Amazon Channel', display_priority: 52 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_name).toBe('Stingray');
  });

  it('unifies "+" and "Plus" spellings across channel wrappers', () => {
    const input: ProviderLike[] = [
      { provider_id: 531, provider_name: 'Paramount Plus', display_priority: 7 },
      { provider_id: 2303, provider_name: 'Paramount Plus Premium', display_priority: 14 },
      { provider_id: 582, provider_name: 'Paramount+ Amazon Channel', display_priority: 26 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(531);
    expect(out[0].provider_name).toBe('Paramount Plus');
  });

  it('merges "Apple TV Store" into "Apple TV" via the alias map', () => {
    const input: ProviderLike[] = [
      { provider_id: 350, provider_name: 'Apple TV', display_priority: 2 },
      { provider_id: 2, provider_name: 'Apple TV Store', display_priority: 3 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(350);
    expect(out[0].provider_name).toBe('Apple TV');
  });

  it('surfaces featured brands first in the curated order, ahead of display_priority', () => {
    const input: ProviderLike[] = [
      { provider_id: 1, provider_name: 'Some Indie Service', display_priority: 0 },
      { provider_id: 2, provider_name: 'Disney Plus', display_priority: 99 },
      { provider_id: 3, provider_name: 'Netflix', display_priority: 50 },
      { provider_id: 4, provider_name: 'Crunchyroll', display_priority: 40 },
    ];

    const out = dedupeProviders(input);

    // Netflix, Disney+, Crunchyroll are featured (in that curated order); the indie one,
    // despite the lowest display_priority, falls to the end.
    expect(out.map((p) => p.provider_name)).toEqual([
      'Netflix',
      'Disney Plus',
      'Crunchyroll',
      'Some Indie Service',
    ]);
  });

  it('keeps distinct brands separate', () => {
    const input: ProviderLike[] = [
      { provider_id: 337, provider_name: 'Disney Plus', display_priority: 4 },
      { provider_id: 619, provider_name: 'Star Plus', display_priority: 6 },
    ];

    const out = dedupeProviders(input);

    expect(out.map((p) => p.provider_id)).toEqual([337, 619]);
  });

  it('normalizes accents, casing and parenthetical qualifiers when keying brands', () => {
    const input: ProviderLike[] = [
      { provider_id: 1, provider_name: 'Globoplay', display_priority: 1 },
      { provider_id: 2, provider_name: 'GLOBOPLÁY (via Amazon)', display_priority: 9 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(1);
  });

  it('falls back to the original name when stripping would leave nothing', () => {
    const input: ProviderLike[] = [
      { provider_id: 99, provider_name: 'Amazon Channel', display_priority: 5 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_name).toBe('Amazon Channel');
  });

  it('keeps the first-seen variant when priorities and penalties tie', () => {
    const input: ProviderLike[] = [
      { provider_id: 100, provider_name: 'Netflix' },
      { provider_id: 200, provider_name: 'Netflix' },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(100);
  });

  it('prefers a variant that has a priority over one that does not', () => {
    const input: ProviderLike[] = [
      { provider_id: 100, provider_name: 'Netflix' },
      { provider_id: 200, provider_name: 'Netflix', display_priority: 5 },
    ];

    const out = dedupeProviders(input);

    expect(out).toHaveLength(1);
    expect(out[0].provider_id).toBe(200);
  });

  it('sorts non-featured brands by display_priority, pushing entries without one to the end', () => {
    const input: ProviderLike[] = [
      { provider_id: 1, provider_name: 'Sun Nxt', display_priority: 6 },
      { provider_id: 2, provider_name: 'Plex' },
      { provider_id: 3, provider_name: 'Looke', display_priority: 4 },
    ];

    const out = dedupeProviders(input);

    expect(out.map((p) => p.provider_id)).toEqual([3, 1, 2]);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeProviders([])).toEqual([]);
  });
});
