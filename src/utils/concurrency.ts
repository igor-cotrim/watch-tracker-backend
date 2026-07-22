/**
 * Runs `fn` over `items` with at most `limit` concurrent executions, preserving
 * input order in the returned array. Used to throttle TMDB calls so a large
 * batch doesn't fan out into hundreds of simultaneous requests and hit rate limits.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
