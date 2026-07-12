/**
 * TypeScript type definitions for the Domain Monitoring System.
 *
 * @module config/types
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain Input Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a single domain entry read from Google Sheets columns A and B.
 */
export interface DomainEntry {
  /** 1-indexed row number in the spreadsheet */
  rowIndex: number;
  /** Company name from Column A */
  company: string;
  /** Raw domain string from Column B (e.g. "example.com" or "https://example.com") */
  domain: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checker Result Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a DNS resolution check.
 */
export interface DNSInfo {
  /** Whether the domain resolved successfully */
  resolved: boolean;
  /** Primary resolved IP address */
  ip?: string;
  /** List of nameservers for the domain */
  nameservers?: string[];
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Result of an SSL/TLS certificate inspection.
 */
export interface SSLInfo {
  /** Whether a valid certificate was found */
  valid: boolean;
  /** Certificate expiry date in YYYY-MM-DD format */
  expiryDate?: string;
  /** Days remaining until certificate expiry (negative = already expired) */
  daysRemaining?: number;
  /** Certificate issuer organisation name */
  issuer?: string;
  /** TLS protocol version (e.g. TLSv1.2, TLSv1.3) */
  protocol?: string;
  /** Whether the certificate chain is trusted by Node's CA store */
  authorized?: boolean;
  /** Error message if the check failed */
  error?: string;
}

/**
 * Result of an HTTP/HTTPS connectivity check.
 */
export interface HTTPInfo {
  /** HTTP response status code */
  statusCode?: number;
  /** Round-trip response time in milliseconds */
  responseTime: number;
  /** Final URL after following all redirects */
  finalURL?: string;
  /** Whether at least one redirect occurred */
  isRedirect: boolean;
  /** Lowercase response headers map */
  headers?: Record<string, string>;
  /** Response body text (capped at 150 KB) */
  body?: string;
  /** Content length in bytes */
  contentLength?: number;
  /** Error message if the request failed */
  error?: string;
}

/**
 * Technology stack and CDN detection results.
 */
export interface TechInfo {
  /** Web server identifier (Nginx, Apache, LiteSpeed, IIS, etc.) */
  server: string;
  /** True if WordPress indicators were found */
  isWordPress: boolean;
  /** True if Cloudflare headers were detected */
  isCloudflare: boolean;
  /** CDN provider name or "None" */
  cdn: string;
  /** Comma-separated list of all detected technologies */
  techStack: string;
}

/**
 * Screenshot capture result.
 */
export interface ScreenshotInfo {
  /** Full-size screenshot public URL (GitHub raw) */
  url?: string;
  /** Thumbnail screenshot public URL (GitHub raw) */
  thumbnailUrl?: string;
  /** Error message if capture failed */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated Output Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete monitoring result for a single domain.
 * Maps 1-to-1 with Google Sheet columns C through AF.
 */
export interface MonitorResult {
  /** The domain entry that was checked */
  domain: DomainEntry;

  // ── Column C ──────────────────────────────────────────────
  /** Online | Offline | Redirect | Error {code} */
  websiteStatus: string;

  // ── Column D ──────────────────────────────────────────────
  /** Raw HTTP status code or empty string */
  httpStatusCode: number | string;

  // ── Column E ──────────────────────────────────────────────
  /** Response time in milliseconds */
  responseTime: number | string;

  // ── Column F ──────────────────────────────────────────────
  /** SSL certificate expiry date (YYYY-MM-DD) */
  sslExpiryDate: string;

  // ── Column G ──────────────────────────────────────────────
  /** Days remaining until SSL expiry */
  sslDaysRemaining: number | string;

  // ── Column H ──────────────────────────────────────────────
  /** Domain WHOIS expiry date (YYYY-MM-DD) */
  domainExpiryDate: string;

  // ── Column I ──────────────────────────────────────────────
  /** HTML <title> tag content */
  websiteTitle: string;

  // ── Column J ──────────────────────────────────────────────
  /** Resolved server IP address */
  serverIP: string;

  // ── Column K ──────────────────────────────────────────────
  /** Best-effort hosting provider name */
  hostingProvider: string;

  // ── Column L ──────────────────────────────────────────────
  /** OK | Failed */
  dnsStatus: string;

  // ── Column M ──────────────────────────────────────────────
  /** Comma-separated nameserver list */
  nameservers: string;

  // ── Column N ──────────────────────────────────────────────
  /** Yes | No */
  httpsEnabled: string;

  // ── Column O ──────────────────────────────────────────────
  /** Final URL if a redirect chain was followed */
  redirectURL: string;

  // ── Column P ──────────────────────────────────────────────
  /** Date of this check run (YYYY-MM-DD) */
  lastCheckedDate: string;

  // ── Column Q ──────────────────────────────────────────────
  /** Time of this check run in IST (HH:MM:SS) */
  lastCheckedTime: string;

  // ── Column R ──────────────────────────────────────────────
  /** Public URL of the full-size screenshot */
  screenshotURL: string;

  // ── Column S ──────────────────────────────────────────────
  /** Public URL of the 400×300 thumbnail */
  screenshotThumbnailURL: string;

  // ── Column T ──────────────────────────────────────────────
  /** Google Sheets IMAGE formula: =IMAGE("url") */
  websiteScreenshot: string;

  // ── Column U ──────────────────────────────────────────────
  /** Semicolon-separated error messages from all sub-checks */
  errorMessage: string;

  // ── Column V ──────────────────────────────────────────────
  /** Page content size (e.g. "42.13 KB") */
  pageSize: string;

  // ── Column W ──────────────────────────────────────────────
  /** Yes | No */
  wordpressDetection: string;

  // ── Column X ──────────────────────────────────────────────
  /** Yes | No */
  cloudflareDetection: string;

  // ── Column Y ──────────────────────────────────────────────
  /** CDN provider name or "None" */
  cdnDetection: string;

  // ── Column Z ──────────────────────────────────────────────
  /** Comma-separated technology stack (Nginx, PHP, WordPress, etc.) */
  technologyStack: string;

  // ── Column AA ─────────────────────────────────────────────
  /** Open Graph og:title meta tag value */
  metaTitle: string;

  // ── Column AB ─────────────────────────────────────────────
  /** Meta description content */
  metaDescription: string;

  // ── Column AC ─────────────────────────────────────────────
  /** SSL certificate issuer organisation */
  sslIssuer: string;

  // ── Column AD ─────────────────────────────────────────────
  /** TLS version string (e.g. TLSv1.3) */
  sslVersion: string;

  // ── Column AE ─────────────────────────────────────────────
  /** Basic SSL grade: A+ | A | B | C | F */
  sslGrade: string;

  // ── Column AF ─────────────────────────────────────────────
  /** Overall result: PASS | FAIL */
  monitoringResult: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime configuration loaded from environment variables.
 */
export interface AppConfig {
  /** Google Sheets spreadsheet ID */
  spreadsheetId: string;
  /** Sheet tab name */
  sheetName: string;
  /** Google service account credentials JSON (raw or base64) */
  googleCredentials: string;
  /** GitHub owner (username or org) for screenshot storage */
  githubOwner: string;
  /** GitHub repository name for screenshot storage */
  githubRepo: string;
  /** GitHub branch for screenshot storage */
  githubBranch: string;
  /** GitHub token (needed locally; Actions uses built-in GITHUB_TOKEN) */
  githubToken: string;
  /** Maximum concurrent domain checks */
  concurrencyLimit: number;
  /** Per-request timeout in milliseconds */
  requestTimeout: number;
  /** Number of retry attempts per request */
  retryAttempts: number;
  /** Whether to capture Playwright screenshots */
  enableScreenshots: boolean;
}
