/**
 * Domain monitor engine — orchestrates all per-domain checks.
 *
 * For every domain this engine:
 *  1. DNS resolution + nameserver lookup
 *  2. HTTP/HTTPS connectivity check (status, headers, body, redirect chain)
 *  3. SSL/TLS certificate inspection (expiry, issuer, protocol, grade)
 *  4. WHOIS domain-expiry lookup (via `whoiser`, graceful N/A on failure)
 *  5. Technology stack detection (server, CMS, CDN, Cloudflare, WordPress)
 *  6. HTML parsing (title, og:title, meta description)
 *  7. Playwright screenshot + thumbnail (if enabled)
 *  8. Hosting provider detection via reverse-DNS
 *
 * All sub-checks are independent — a failure in one never skips others.
 *
 * @module services/monitor/engine
 */

import whoiser                from 'whoiser';
import { DomainEntry, MonitorResult, SSLInfo } from '../../config/types';
import { DNSChecker }         from '../dns/checker';
import { SSLChecker }         from '../ssl/checker';
import { HTTPChecker }        from '../http/checker';
import { ScreenshotService }  from '../playwright/screenshot';
import { config }             from '../../config';
import { logger }             from '../../utils/logger';
import { withRetry, withTimeout } from '../../utils/concurrency';
import {
  normalizeDomain,
  formatDate,
  formatTimeIST,
  extractTitle,
  extractMetaDescription,
  extractMetaTitle,
  detectWordPress,
  detectCloudflare,
  detectCDN,
  detectTechStack,
  determineWebsiteStatus,
  detectHostingProvider,
  bytesToKB,
  determineSSLGrade,
} from '../../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// WHOIS Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to retrieve the domain expiry date from WHOIS data.
 * Returns "N/A" on any failure (WHOIS servers are unreliable by design).
 *
 * @param hostname - Full domain name (subdomains stripped internally)
 */
async function getWhoisExpiry(hostname: string): Promise<string> {
  try {
    const rootDomain = hostname.split('.').slice(-2).join('.');

    const data = await withTimeout(
      whoiser(rootDomain, { timeout: 8_000, follow: 2 }),
      10_000,
      'WHOIS timeout',
    );

    // whoiser returns: { "whois.server": { "Field": "value" } }
    for (const serverData of Object.values(data)) {
      const expiry =
        (serverData['Registry Expiry Date']                 as string) ||
        (serverData['Expiry Date']                          as string) ||
        (serverData['Expiration Date']                      as string) ||
        (serverData['Registrar Registration Expiration Date'] as string) ||
        (serverData['paid-till']                            as string) ||
        (serverData['expires']                              as string);

      if (expiry) {
        const d = new Date(expiry);
        if (!isNaN(d.getTime())) return formatDate(d);
      }
    }
  } catch {
    // WHOIS failure is non-fatal
  }

  return 'N/A';
}

// ─────────────────────────────────────────────────────────────────────────────
// Monitor Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core orchestration engine: runs all checks for a single domain
 * and returns a fully-populated {@link MonitorResult}.
 */
export class MonitorEngine {
  private readonly dns:        DNSChecker;
  private readonly ssl:        SSLChecker;
  private readonly http:       HTTPChecker;
  private          screenshot: ScreenshotService | null = null;

  constructor() {
    this.dns  = new DNSChecker();
    this.ssl  = new SSLChecker();
    this.http = new HTTPChecker(config.requestTimeout);
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  /**
   * Initialises the screenshot service (launches Chromium).
   * No-op if screenshots are disabled in config.
   */
  async initializeScreenshots(): Promise<void> {
    if (!config.enableScreenshots) return;
    this.screenshot = new ScreenshotService();
    await this.screenshot.initialize();
  }

  /**
   * Tears down the screenshot service (closes Chromium).
   * Always call this in a `finally` block.
   */
  async cleanup(): Promise<void> {
    await this.screenshot?.close();
  }

  // ─── Private: result factory ───────────────────────────────

  /**
   * Returns a MonitorResult populated with safe defaults.
   * Used as the initial state before real values are written.
   */
  private defaultResult(
    domainEntry: DomainEntry,
    now: Date,
  ): MonitorResult {
    return {
      domain:                domainEntry,
      websiteStatus:         'Error',
      httpStatusCode:        '',
      responseTime:          '',
      sslExpiryDate:         'N/A',
      sslDaysRemaining:      '',
      domainExpiryDate:      'N/A',
      websiteTitle:          '',
      serverIP:              '',
      hostingProvider:       '',
      dnsStatus:             'Failed',
      nameservers:           '',
      httpsEnabled:          'No',
      redirectURL:           '',
      lastCheckedDate:       formatDate(now),
      lastCheckedTime:       formatTimeIST(now),
      screenshotURL:         '',
      screenshotThumbnailURL: '',
      websiteScreenshot:     '',
      errorMessage:          '',
      pageSize:              '',
      wordpressDetection:    'No',
      cloudflareDetection:   'No',
      cdnDetection:          'None',
      technologyStack:       '',
      metaTitle:             '',
      metaDescription:       '',
      sslIssuer:             '',
      sslVersion:            '',
      sslGrade:              '',
      monitoringResult:      'FAIL',
    };
  }

  // ─── Public: main check ────────────────────────────────────

  /**
   * Performs all monitoring checks for a single domain entry and returns
   * a complete {@link MonitorResult}.
   *
   * This method **never throws** — all errors are captured in the result's
   * `errorMessage` field so that the monitoring loop continues uninterrupted.
   *
   * @param domainEntry - Domain row from Google Sheets
   */
  async monitorDomain(domainEntry: DomainEntry): Promise<MonitorResult> {
    const hostname = normalizeDomain(domainEntry.domain);
    const now      = new Date();
    const errors:  string[] = [];
    let   sslInfo: SSLInfo  = { valid: false };

    logger.info(`Checking: ${hostname}`);

    const result = this.defaultResult(domainEntry, now);

    // ──────────────────────────────────────────────────────────
    // 1. DNS Check
    // ──────────────────────────────────────────────────────────
    try {
      const dns = await withRetry(
        () => this.dns.check(hostname, config.requestTimeout),
        config.retryAttempts,
      );

      if (dns.resolved && dns.ip) {
        result.dnsStatus    = 'OK';
        result.serverIP     = dns.ip;
        result.nameservers  = (dns.nameservers ?? []).join(', ');
        result.hostingProvider = await detectHostingProvider(dns.ip);
      } else {
        result.dnsStatus = 'Failed';
        errors.push(`DNS: ${dns.error ?? 'resolution failed'}`);
      }
    } catch (e) {
      errors.push(`DNS: ${e instanceof Error ? e.message : 'unknown error'}`);
    }

    // ──────────────────────────────────────────────────────────
    // 2. HTTP/HTTPS Check
    // ──────────────────────────────────────────────────────────
    try {
      const http = await withRetry(
        () => this.http.check(hostname, true),
        config.retryAttempts,
      );

      result.httpStatusCode = http.statusCode ?? '';
      result.responseTime   = http.responseTime;

      if (http.error && !http.statusCode) {
        errors.push(`HTTP: ${http.error}`);
        result.websiteStatus = 'Offline';
      } else if (http.statusCode) {
        result.websiteStatus = determineWebsiteStatus(
          http.statusCode,
          http.isRedirect,
        );

        const finalUrl = http.finalURL ?? '';
        result.httpsEnabled = finalUrl.startsWith('https') ? 'Yes' : 'No';

        if (http.isRedirect && finalUrl !== `https://${hostname}` && finalUrl !== `http://${hostname}`) {
          result.redirectURL = finalUrl;
        }

        if (http.error) {
          errors.push(`HTTP fallback: ${http.error}`);
        }
      }

      // ── HTML analysis ──────────────────────────────────────
      if (http.body) {
        const html    = http.body;
        const headers = http.headers ?? {};

        result.websiteTitle   = extractTitle(html);
        result.metaTitle      = extractMetaTitle(html);
        result.metaDescription = extractMetaDescription(html);
        result.pageSize       = bytesToKB(http.contentLength ?? Buffer.byteLength(html, 'utf8'));

        const isWP          = detectWordPress(html, headers);
        const isCF          = detectCloudflare(headers);
        const cdn           = detectCDN(headers, isCF);
        const tech          = detectTechStack(headers, html);

        result.wordpressDetection  = isWP ? 'Yes' : 'No';
        result.cloudflareDetection = isCF ? 'Yes' : 'No';
        result.cdnDetection        = cdn;
        result.technologyStack     = tech;
      }
    } catch (e) {
      errors.push(`HTTP: ${e instanceof Error ? e.message : 'unknown error'}`);
      result.websiteStatus = 'Error';
    }

    // ──────────────────────────────────────────────────────────
    // 3. SSL Certificate Check
    // ──────────────────────────────────────────────────────────
    try {
      sslInfo = await withRetry(
        () => this.ssl.check(hostname, config.requestTimeout),
        config.retryAttempts,
      );

      if (sslInfo.valid) {
        result.sslExpiryDate   = sslInfo.expiryDate    ?? 'Unknown';
        result.sslDaysRemaining = sslInfo.daysRemaining ?? '';
        result.sslIssuer       = sslInfo.issuer         ?? 'Unknown';
        result.sslVersion      = sslInfo.protocol       ?? 'Unknown';
        result.sslGrade        = determineSSLGrade(sslInfo);
        result.httpsEnabled    = result.httpsEnabled === 'No' ? 'Yes' : result.httpsEnabled;

        logger.debug(`SSL OK: ${hostname}`, {
          expiry:         sslInfo.expiryDate,
          daysRemaining:  sslInfo.daysRemaining,
          grade:          result.sslGrade,
        });
      } else {
        result.sslGrade = 'F';
        if (sslInfo.error) errors.push(`SSL: ${sslInfo.error}`);
      }
    } catch (e) {
      result.sslGrade = 'F';
      errors.push(`SSL: ${e instanceof Error ? e.message : 'check failed'}`);
    }

    // ──────────────────────────────────────────────────────────
    // 4. WHOIS Domain Expiry
    // ──────────────────────────────────────────────────────────
    try {
      result.domainExpiryDate = await withTimeout(
        getWhoisExpiry(hostname),
        12_000,
        'WHOIS timeout',
      );
    } catch {
      result.domainExpiryDate = 'N/A';
    }

    // ──────────────────────────────────────────────────────────
    // 5. Screenshot
    // ──────────────────────────────────────────────────────────
    if (this.screenshot && result.websiteStatus !== 'Offline') {
      try {
        const shot = await withTimeout(
          this.screenshot.capture(hostname),
          35_000,
          `Screenshot timeout: ${hostname}`,
        );

        if (shot.url) {
          result.screenshotURL          = shot.url;
          result.screenshotThumbnailURL = shot.thumbnailUrl ?? '';
          // USER_ENTERED sheet mode will evaluate this formula
          result.websiteScreenshot      = shot.thumbnailUrl
            ? `=IMAGE("${shot.thumbnailUrl}")`
            : `=IMAGE("${shot.url}")`;

          logger.success(`Screenshot ready: ${hostname}`);
        } else if (shot.error) {
          errors.push(`Screenshot: ${shot.error}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'screenshot failed';
        errors.push(`Screenshot: ${msg}`);
        logger.warn(`Screenshot error for ${hostname}: ${msg}`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // 6. Final Aggregation
    // ──────────────────────────────────────────────────────────
    const online = result.websiteStatus === 'Online' || result.websiteStatus === 'Redirect';
    result.monitoringResult = online ? 'PASS' : 'FAIL';
    result.errorMessage     = errors.join('; ');

    if (result.monitoringResult === 'FAIL') {
      logger.logFailedDomain(hostname, result.errorMessage || result.websiteStatus);
    }

    logger.success(`Done: ${hostname}`, {
      status:  result.websiteStatus,
      code:    result.httpStatusCode,
      ssl:     result.sslGrade,
      result:  result.monitoringResult,
    });

    return result;
  }
}
