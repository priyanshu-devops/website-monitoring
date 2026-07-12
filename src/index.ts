/**
 * Entry point for the Domain Monitoring System.
 *
 * Execution flow:
 *  1. Load and validate configuration
 *  2. Initialise Playwright browser (if screenshots enabled)
 *  3. Ensure Google Sheet has correct header row
 *  4. Read all domain entries from the sheet
 *  5. Run monitoring checks concurrently via a promise pool
 *  6. Batch-update results to Google Sheets every 25 completions
 *  7. Final batch update for any remaining results
 *  8. Print run summary (total / pass / fail / duration)
 *  9. Graceful cleanup (close browser)
 *
 * Run with:
 *   npx ts-node src/index.ts            (local)
 *   npm run monitor                     (local shortcut)
 *   GitHub Actions workflow             (production)
 *
 * @module src/index
 */

import { config }         from '../config';
import { SheetsService }  from '../services/google/sheets';
import { MonitorEngine }  from '../services/monitor/engine';
import { promisePool }    from '../utils/concurrency';
import { logger }         from '../utils/logger';
import { MonitorResult }  from '../config/types';

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/** How many completed results to buffer before flushing to Sheets */
const BATCH_FLUSH_SIZE = 25;

async function main(): Promise<void> {
  const runStart = Date.now();

  // ── Banner ─────────────────────────────────────────────────
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════╗');
  logger.info('║     DOMAIN MONITORING SYSTEM — RUN STARTED      ║');
  logger.info('╚══════════════════════════════════════════════════╝');
  logger.info(`  Spreadsheet : ${config.spreadsheetId}`);
  logger.info(`  Sheet       : ${config.sheetName}`);
  logger.info(`  Concurrency : ${config.concurrencyLimit}`);
  logger.info(`  Timeout     : ${config.requestTimeout} ms`);
  logger.info(`  Retries     : ${config.retryAttempts}`);
  logger.info(`  Screenshots : ${config.enableScreenshots ? 'Enabled' : 'Disabled'}`);
  logger.info(`  Log file    : ${logger.getLogFilePath()}`);
  logger.info('');

  const sheets = new SheetsService();
  const engine = new MonitorEngine();

  try {
    // ── Initialise services ───────────────────────────────────
    logger.info('Initialising services…');
    await engine.initializeScreenshots();
    await sheets.ensureHeaders();

    // ── Read domains ──────────────────────────────────────────
    const domains = await sheets.readDomains();

    if (domains.length === 0) {
      logger.warn('No domains found in Column B of the sheet. Nothing to do.');
      return;
    }

    logger.info(`Starting monitoring of ${domains.length} domain(s)…`);
    logger.info('');

    // ── State ─────────────────────────────────────────────────
    const results: MonitorResult[]   = [];
    const pendingBatch: MonitorResult[] = [];
    let completed  = 0;
    let passCount  = 0;
    let failCount  = 0;

    /** Flushes pending results to Sheets and clears the buffer. */
    async function flushBatch(): Promise<void> {
      if (pendingBatch.length === 0) return;
      const batch = pendingBatch.splice(0);           // atomic drain
      try {
        await sheets.batchUpdate(batch);
      } catch (err) {
        logger.error('Batch flush failed — will retry in final flush', {
          error: String(err),
          count: batch.length,
        });
        // Re-enqueue so the final flush can retry
        pendingBatch.push(...batch);
      }
    }

    // ── Concurrency pool ──────────────────────────────────────
    await promisePool(domains, config.concurrencyLimit, async (entry, _idx) => {
      let result: MonitorResult;

      try {
        result = await engine.monitorDomain(entry);
      } catch (err) {
        // Absolute safety net — monitorDomain itself never throws,
        // but defend against unexpected errors.
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Unexpected error processing ${entry.domain}`, { error: message });
        logger.logFailedDomain(entry.domain, message);
        return;
      }

      // Thread-safe accumulation (JS single-threaded event loop)
      results.push(result);
      pendingBatch.push(result);
      completed++;

      if (result.monitoringResult === 'PASS') passCount++;
      else                                     failCount++;

      logger.progress(completed, domains.length, entry.domain);

      // Flush every N completions to provide live progress in Sheets
      if (pendingBatch.length >= BATCH_FLUSH_SIZE) {
        await flushBatch();
      }
    });

    // ── Final flush ───────────────────────────────────────────
    await flushBatch();

    // ── Summary ───────────────────────────────────────────────
    const elapsedSec  = Math.round((Date.now() - runStart) / 1_000);
    const elapsedMin  = Math.floor(elapsedSec / 60);
    const elapsedSecs = elapsedSec % 60;

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════╗');
    logger.info('║          MONITORING COMPLETED SUCCESSFULLY       ║');
    logger.info('╚══════════════════════════════════════════════════╝');
    logger.info(`  Total domains  : ${domains.length}`);
    logger.success(`  PASS           : ${passCount}`);
    logger.warn(   `  FAIL           : ${failCount}`);
    logger.info(`  Duration       : ${elapsedMin}m ${elapsedSecs}s`);
    logger.info(`  Failed log     : ${logger.getFailedDomainsPath()}`);
    logger.info('');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Fatal error during monitoring run', { error: message });
    process.exitCode = 1;
  } finally {
    await engine.cleanup();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
