/**
 * Structured logger for the Domain Monitoring System.
 *
 * Outputs to:
 *  - Colorized console for real-time visibility
 *  - Daily log file in ./logs/ for audit trail
 *  - Separate failed-domains log for post-run analysis
 *
 * @module utils/logger
 */

import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SUCCESS';

const LOG_DIR = path.join(process.cwd(), 'logs');
const TODAY   = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const LOG_FILE           = path.join(LOG_DIR, `monitor-${TODAY}.log`);
const FAILED_DOMAIN_FILE = path.join(LOG_DIR, `failed-domains-${TODAY}.log`);

// Ensure logs directory exists on first import
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ANSI colour codes
const COLOUR: Record<LogLevel | 'RESET', string> = {
  INFO:    '\x1b[36m',   // Cyan
  WARN:    '\x1b[33m',   // Yellow
  ERROR:   '\x1b[31m',   // Red
  DEBUG:   '\x1b[35m',   // Magenta
  SUCCESS: '\x1b[32m',   // Green
  RESET:   '\x1b[0m',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core write function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a log message with ISO timestamp and level badge.
 */
function formatLine(level: LogLevel, message: string, meta?: object): string {
  const ts      = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.padEnd(7)}] ${message}${metaStr}`;
}

/**
 * Writes a single log entry to console (with colour) and the daily log file.
 */
function write(level: LogLevel, message: string, meta?: object): void {
  const line = formatLine(level, message, meta);

  // ── Console ──────────────────────────────────────────────
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const dim = '\x1b[90m';
  process.stdout.write(`${dim}[${ts}]${COLOUR.RESET} ${COLOUR[level]}[${level.padEnd(7)}]${COLOUR.RESET} ${message}${metaStr}\n`);

  // ── File ─────────────────────────────────────────────────
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Non-fatal — don't crash the monitor if disk is read-only
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Application-wide structured logger.
 */
export const logger = {
  /** Informational message */
  info: (message: string, meta?: object): void => write('INFO', message, meta),

  /** Non-critical warning */
  warn: (message: string, meta?: object): void => write('WARN', message, meta),

  /** Recoverable or fatal error */
  error: (message: string, meta?: object): void => write('ERROR', message, meta),

  /** Verbose debug message */
  debug: (message: string, meta?: object): void => write('DEBUG', message, meta),

  /** Successful operation confirmation */
  success: (message: string, meta?: object): void => write('SUCCESS', message, meta),

  /**
   * Renders a progress bar for the domain monitoring loop.
   *
   * @param current  - Number of domains processed so far
   * @param total    - Total number of domains
   * @param domain   - Currently processing domain (for display)
   */
  progress(current: number, total: number, domain: string): void {
    const pct     = Math.round((current / total) * 100);
    const filled  = Math.floor(pct / 5);
    const bar     = '█'.repeat(filled) + '░'.repeat(20 - filled);
    write('INFO', `[${bar}] ${String(pct).padStart(3)}% (${current}/${total}) → ${domain}`);
  },

  /**
   * Appends a domain + error message to the dedicated failed-domains log.
   * Does NOT print to console (avoids noise; errors are already logged inline).
   *
   * @param domain  - The failed domain name
   * @param error   - Error description
   */
  logFailedDomain(domain: string, error: string): void {
    const line = `${new Date().toISOString()} | ${domain} | ${error}\n`;
    try {
      fs.appendFileSync(FAILED_DOMAIN_FILE, line);
    } catch {
      // Non-fatal
    }
  },

  /**
   * Returns the absolute path to today's main log file.
   */
  getLogFilePath(): string {
    return LOG_FILE;
  },

  /**
   * Returns the absolute path to today's failed-domains log file.
   */
  getFailedDomainsPath(): string {
    return FAILED_DOMAIN_FILE;
  },
};
