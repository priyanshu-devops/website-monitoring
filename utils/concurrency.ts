/**
 * Concurrency utilities for the Domain Monitoring System.
 *
 * Provides:
 *  - {@link promisePool} — bounded concurrent execution
 *  - {@link withRetry}   — exponential-backoff retry wrapper
 *  - {@link withTimeout} — deadline enforcement for any promise
 *
 * @module utils/concurrency
 */

// ─────────────────────────────────────────────────────────────────────────────
// Promise Pool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes an async task for every item in `items`, keeping at most `limit`
 * tasks running concurrently (a "promise pool" / "worker-pool" pattern).
 *
 * Errors thrown inside `fn` are swallowed here; callers should handle errors
 * within `fn` and record them in their own result collection.
 *
 * @param items  - Array of items to process
 * @param limit  - Maximum number of concurrent executions
 * @param fn     - Async function called with (item, index)
 *
 * @example
 * await promisePool(domains, 10, async (domain, i) => {
 *   results[i] = await engine.monitorDomain(domain);
 * });
 */
export async function promisePool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  /**
   * Worker: picks the next unclaimed item, processes it, then recurses.
   */
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await fn(items[index], index);
      } catch {
        // Safety net — individual fn() calls should handle their own errors
      }
    }
  }

  // Spawn exactly min(limit, items.length) parallel workers
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry with Exponential Backoff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls `fn` up to `maxAttempts` times, waiting progressively longer between
 * failures (exponential backoff: delay × attempt).
 *
 * @param fn          - Async function to attempt
 * @param maxAttempts - Total number of tries (default: 2)
 * @param delayMs     - Base delay in ms between retries (default: 1 000 ms)
 *
 * @throws {Error} The last error encountered if all attempts fail
 *
 * @example
 * const result = await withRetry(() => sheetsApi.get(range), 3, 2000);
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 2,
  delayMs     = 1_000,
): Promise<T> {
  let lastError: Error = new Error('withRetry: no attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        const wait = delayMs * attempt;
        await sleep(wait);
      }
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout Enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Races `promise` against a hard deadline.
 * If the deadline fires first, the returned promise rejects with `errorMessage`.
 *
 * @param promise       - The promise to time-limit
 * @param timeoutMs     - Deadline in milliseconds
 * @param errorMessage  - Rejection message if the deadline fires
 *
 * @example
 * const result = await withTimeout(dnsCheck(domain), 10_000, 'DNS timeout');
 */
export function withTimeout<T>(
  promise:      Promise<T>,
  timeoutMs:    number,
  errorMessage  = 'Operation timed out',
): Promise<T> {
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
  );
  return Promise.race([promise, deadline]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
