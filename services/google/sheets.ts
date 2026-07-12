/**
 * Google Sheets service for the Domain Monitoring System.
 *
 * Responsibilities:
 *  - Read domain entries from columns A and B
 *  - Write monitoring results to columns C through AF
 *  - Batch updates to minimise API quota consumption
 *  - Automatic retry on quota/transient errors
 *
 * Column mapping (zero-indexed offset from column C):
 *
 *  C=0   Website Status         D=1   HTTP Status Code
 *  E=2   Response Time          F=3   SSL Expiry Date
 *  G=4   SSL Days Remaining     H=5   Domain Expiry Date
 *  I=6   Website Title          J=7   Server IP
 *  K=8   Hosting Provider       L=9   DNS Status
 *  M=10  Nameservers            N=11  HTTPS Enabled
 *  O=12  Redirect URL           P=13  Last Checked Date
 *  Q=14  Last Checked Time      R=15  Screenshot URL
 *  S=16  Screenshot Thumb URL   T=17  Website Screenshot (formula)
 *  U=18  Error Message          V=19  Page Size
 *  W=20  WordPress Detection    X=21  Cloudflare Detection
 *  Y=22  CDN Detection          Z=23  Technology Stack
 *  AA=24 Meta Title             AB=25 Meta Description
 *  AC=26 SSL Issuer             AD=27 SSL Version
 *  AE=28 SSL Grade              AF=29 Monitoring Result
 *
 * @module services/google/sheets
 */

import { google, sheets_v4 }  from 'googleapis';
import { createGoogleAuth }    from './auth';
import { config }              from '../../config';
import { DomainEntry, MonitorResult } from '../../config/types';
import { logger }              from '../../utils/logger';
import { withRetry, sleep }    from '../../utils/concurrency';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Header row content for columns A through AF */
const HEADERS: string[] = [
  'Company Name', 'Domain Name',
  // ↓ auto-populated columns (C–AF)
  'Website Status', 'HTTP Status Code', 'Response Time (ms)',
  'SSL Expiry Date', 'SSL Days Remaining', 'Domain Expiry Date',
  'Website Title', 'Server IP', 'Hosting Provider',
  'DNS Status', 'Nameservers', 'HTTPS Enabled', 'Redirect URL',
  'Last Checked Date', 'Last Checked Time',
  'Screenshot URL', 'Screenshot Thumbnail URL', 'Website Screenshot',
  'Error Message', 'Page Size',
  'WordPress Detection', 'Cloudflare Detection', 'CDN Detection',
  'Technology Stack', 'Meta Title', 'Meta Description',
  'SSL Issuer', 'SSL Version', 'SSL Grade', 'Monitoring Result',
];

/** Max rows per batchUpdate call (Sheets API limit is 1 000 ranges per call) */
const BATCH_CHUNK_SIZE = 100;

/** Delay between batchUpdate chunks to avoid hitting write quota */
const INTER_CHUNK_DELAY_MS = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides read and write access to the monitoring Google Sheet.
 */
export class SheetsService {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName: string;

  constructor() {
    const auth      = createGoogleAuth();
    this.sheets     = google.sheets({ version: 'v4', auth: auth as any });
    this.spreadsheetId = config.spreadsheetId;
    this.sheetName  = config.sheetName;
  }

  // ─── Private helpers ───────────────────────────────────────

  /** Wraps a Sheets range in the configured sheet name. */
  private range(a1: string): string {
    return `${this.sheetName}!${a1}`;
  }

  /**
   * Builds an ordered array of 30 values for columns C–AF from a MonitorResult.
   * The order must match the column definitions at the top of this file.
   */
  private buildRowValues(r: MonitorResult): (string | number)[] {
    return [
      r.websiteStatus,           // C
      r.httpStatusCode,          // D
      r.responseTime,            // E
      r.sslExpiryDate,           // F
      r.sslDaysRemaining,        // G
      r.domainExpiryDate,        // H
      r.websiteTitle,            // I
      r.serverIP,                // J
      r.hostingProvider,         // K
      r.dnsStatus,               // L
      r.nameservers,             // M
      r.httpsEnabled,            // N
      r.redirectURL,             // O
      r.lastCheckedDate,         // P
      r.lastCheckedTime,         // Q
      r.screenshotURL,           // R
      r.screenshotThumbnailURL,  // S
      r.websiteScreenshot,       // T  (=IMAGE("...") formula)
      r.errorMessage,            // U
      r.pageSize,                // V
      r.wordpressDetection,      // W
      r.cloudflareDetection,     // X
      r.cdnDetection,            // Y
      r.technologyStack,         // Z
      r.metaTitle,               // AA
      r.metaDescription,         // AB
      r.sslIssuer,               // AC
      r.sslVersion,              // AD
      r.sslGrade,                // AE
      r.monitoringResult,        // AF
    ];
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Writes the header row to row 1 (A1:AF1).
   * Safe to call on every run — idempotent.
   */
  async ensureHeaders(): Promise<void> {
    logger.info('Ensuring header row is present...');

    await withRetry(async () => {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId:  this.spreadsheetId,
        range:          this.range('A1:AF1'),
        valueInputOption: 'RAW',
        requestBody:    { values: [HEADERS] },
      });
    }, 3, 2_000);

    logger.success('Header row verified');
  }

  /**
   * Reads all rows from columns A and B (skipping the header row) and
   * returns them as an array of {@link DomainEntry} objects.
   *
   * Rows with an empty domain column (B) are silently skipped.
   */
  async readDomains(): Promise<DomainEntry[]> {
    logger.info('Reading domain list from Google Sheets…');

    const response = await withRetry(async () => {
      return this.sheets.spreadsheets.values.get({
        spreadsheetId:     this.spreadsheetId,
        range:             this.range('A:B'),
        valueRenderOption: 'FORMATTED_VALUE',
      });
    }, 3, 2_000);

    const rows    = response.data.values ?? [];
    const domains: DomainEntry[] = [];

    // Row index 0 = header → start at 1
    for (let i = 1; i < rows.length; i++) {
      const row     = rows[i];
      const company = (row?.[0] ?? '').toString().trim();
      const domain  = (row?.[1] ?? '').toString().trim();

      if (domain) {
        domains.push({
          rowIndex: i + 1,  // 1-based spreadsheet row (header = row 1)
          company,
          domain,
        });
      }
    }

    logger.success(`Found ${domains.length} domains to monitor`);
    return domains;
  }

  /**
   * Batch-updates monitoring results to the spreadsheet.
   *
   * Uses `valueInputOption: USER_ENTERED` so that the `=IMAGE(...)` formula
   * in column T is evaluated by Sheets rather than stored as a literal string.
   *
   * Updates are sent in chunks of {@link BATCH_CHUNK_SIZE} to stay within
   * the Sheets API write quota.
   *
   * @param results - Array of completed monitor results
   */
  async batchUpdate(results: MonitorResult[]): Promise<void> {
    if (results.length === 0) return;

    logger.info(`Batch-updating ${results.length} row(s) in Sheets…`);

    const valueRanges: sheets_v4.Schema$ValueRange[] = results.map((r) => ({
      range:  this.range(`C${r.domain.rowIndex}:AF${r.domain.rowIndex}`),
      values: [this.buildRowValues(r)],
    }));

    // Split into chunks to respect API quotas
    for (let i = 0; i < valueRanges.length; i += BATCH_CHUNK_SIZE) {
      const chunk = valueRanges.slice(i, i + BATCH_CHUNK_SIZE);

      await withRetry(async () => {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody:   {
            valueInputOption: 'USER_ENTERED',
            data:             chunk,
          },
        });
      }, 4, 3_000);

      // Throttle between chunks
      if (i + BATCH_CHUNK_SIZE < valueRanges.length) {
        await sleep(INTER_CHUNK_DELAY_MS);
      }
    }

    logger.success(`Updated ${results.length} row(s) successfully`);
  }
}
