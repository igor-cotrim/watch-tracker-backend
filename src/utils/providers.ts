// Deduplicates streaming providers that TMDB returns as separate brand variants.
//
// TMDB lists three kinds of same-brand noise as distinct entries, each with its own
// `provider_id` and a near-identical logo:
//   1. Ad/price tiers   — "Netflix" + "Netflix Standard with Ads"
//   2. Store aliases     — "Amazon Prime Video" + "Amazon Prime Video with Ads" + "Amazon Video"
//   3. Channel wrappers  — "Crunchyroll" + "Crunchyroll Amazon Channel", "HBO Max Amazon Channel"
// Rendered as-is they show up as duplicate/cluttered chips. We collapse each brand to a
// single entry, keeping the *canonical* variant (no channel/tier suffix) as the survivor and
// exposing a cleaned-up display name so "Stingray Amazon Channel" simply reads "Stingray".

export interface ProviderLike {
  provider_id: number;
  provider_name: string;
  logo_path?: string;
  display_priority?: number;
}

// Distribution wrappers ("… Amazon Channel", "… Apple TV Channel(s)") and ad/price tiers.
// Stripped from both the merge key and the display name; also drive survivor ranking.
const CHANNEL_SUFFIX = /\s*\b(?:amazon|apple tv)\s+channels?\b/gi;
const TIER_SUFFIX = /\s*\b(?:standard with ads|with ads|premium)\b/gi;

// Folds cross-name collisions that don't share a common substring, keyed on the normalized
// brand. Small on purpose — extend as new region variants surface.
const BRAND_ALIASES: Record<string, string> = {
  'amazon prime video': 'prime video',
  'amazon video': 'prime video',
  'prime video': 'prime video',
  'hbo max': 'max',
  max: 'max',
  // Apple TV+ (subscription) and the Apple TV Store (rent/buy) are the same brand/logo.
  'apple tv store': 'apple tv',
};

// Well-known brands surfaced first, in this exact order. Everything else keeps TMDB's
// `display_priority` ordering after these. Keys are normalized brand keys (see `brandKey`).
// Edit this list to change which providers lead and in what order.
const FEATURED_ORDER = [
  'netflix',
  'prime video',
  'apple tv',
  'disney plus',
  'crunchyroll',
  'max',
  'paramount plus',
  'globoplay',
  'telecine',
  'mubi',
  'pluto tv',
];

// Human-facing name with channel/tier noise removed (keeps original casing and "+").
// Falls back to the original if stripping would leave nothing.
function cleanDisplayName(name: string): string {
  const cleaned = name
    .replace(CHANNEL_SUFFIX, '')
    .replace(TIER_SUFFIX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : name.trim();
}

// Stable brand key: cleaned name, lowercased, accent-free, with "+" spelled as "plus" so
// "Paramount+" and "Paramount Plus" collapse. Aliases applied last.
function brandKey(name: string): string {
  const normalized = cleanDisplayName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/\+/g, ' plus')
    .replace(/\(.*?\)/g, '') // drop parenthetical qualifiers
    .replace(/\s+/g, ' ')
    .trim();

  return BRAND_ALIASES[normalized] ?? normalized;
}

// Position among the featured brands (lower first); non-featured brands rank last.
function featuredRank(name: string): number {
  const index = FEATURED_ORDER.indexOf(brandKey(name));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// Lower is more canonical: a plain brand beats its channel wrapper, which beats a tier.
function noisePenalty(name: string): number {
  let penalty = 0;
  if (/\b(?:amazon|apple tv)\s+channels?\b/i.test(name)) penalty += 2;
  if (/\b(?:standard with ads|with ads|premium)\b/i.test(name)) penalty += 1;
  return penalty;
}

// True when `candidate` should represent the brand over the currently-kept `current`.
function isMoreCanonical(candidate: ProviderLike, current: ProviderLike): boolean {
  const candidatePenalty = noisePenalty(candidate.provider_name);
  const currentPenalty = noisePenalty(current.provider_name);
  if (candidatePenalty !== currentPenalty) return candidatePenalty < currentPenalty;

  const candidatePriority = candidate.display_priority ?? Number.MAX_SAFE_INTEGER;
  const currentPriority = current.display_priority ?? Number.MAX_SAFE_INTEGER;
  return candidatePriority < currentPriority;
}

/**
 * Collapses same-brand provider variants into one entry per brand. The survivor is the most
 * canonical variant (lowest noise penalty, then lowest `display_priority`), re-exposed with a
 * cleaned display name. Result is ordered by `display_priority`.
 */
export function dedupeProviders<T extends ProviderLike>(providers: T[]): T[] {
  const byBrand = new Map<string, T>();

  for (const provider of providers) {
    const key = brandKey(provider.provider_name);
    const existing = byBrand.get(key);
    if (!existing || isMoreCanonical(provider, existing)) {
      byBrand.set(key, provider);
    }
  }

  return [...byBrand.values()]
    .map((provider) => ({ ...provider, provider_name: cleanDisplayName(provider.provider_name) }))
    .sort((a, b) => {
      const rankDelta = featuredRank(a.provider_name) - featuredRank(b.provider_name);
      if (rankDelta !== 0) return rankDelta;
      return (
        (a.display_priority ?? Number.MAX_SAFE_INTEGER) -
        (b.display_priority ?? Number.MAX_SAFE_INTEGER)
      );
    });
}
