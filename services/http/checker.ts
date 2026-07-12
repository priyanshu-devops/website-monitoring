/**
 * HTTP/HTTPS connectivity and content inspection service.
 *
 * For each domain this checker:
 *  1. Makes an HTTPS GET request (follows up to 10 redirects)
 *  2. Captures status code, headers, body (≤150 KB), response time
 *  3. Falls back to plain HTTP if HTTPS yields a connection-level error
 *  4. Records all Cloudflare error codes (521/522/523) cleanly
 *
 * All errors are captured and returned as structured data —
 * an exception is never thrown to the caller.
 *
 * @module services/http/checker
 */

import axios, { AxiosError } from 'axios';
import { HTTPInfo }           from '../../config/types';
import { logger }             from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Realistic browser User-Agent to avoid bot-blocking */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

/** Maximum response body size to buffer (150 KB) */
const MAX_BODY_BYTES = 150_000;

/** Axios request headers sent with every check */
const BASE_HEADERS: Record<string, string> = {
  'User-Agent':      USER_AGENT,
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'none',
  'Sec-Fetch-User':  '?1',
  'Cache-Control':   'max-age=0',
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Checker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTTP/HTTPS connectivity and content inspection service.
 */
export class HTTPChecker {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Performs an HTTP check on a domain.
   *
   * @param hostname   - Normalised domain (no protocol)
   * @param useHTTPS   - Whether to use HTTPS (default: true)
   */
  async check(hostname: string, useHTTPS = true): Promise<HTTPInfo> {
    const protocol  = useHTTPS ? 'https' : 'http';
    const url       = `${protocol}://${hostname}`;
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout:          this.timeoutMs,
        maxRedirects:     10,
        validateStatus:   () => true,       // never throw on 4xx/5xx
        headers:          BASE_HEADERS,
        maxContentLength: MAX_BODY_BYTES,
        decompress:       true,
        responseType:     'text',
      });

      const responseTime = Date.now() - startTime;

      // ── Normalise headers ─────────────────────────────────
      const headers: Record<string, string> = {};
      Object.entries(response.headers).forEach(([k, v]) => {
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
      });

      // ── Final URL after redirects ─────────────────────────
      let finalURL: string = url;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = response.request as any;
        finalURL  =
          req?.res?.responseUrl                   ??
          req?._redirectable?._currentUrl         ??
          req?.responseURL                        ??
          url;
      } catch {
        // keep original url
      }

      const isRedirect    = finalURL !== url;
      const body          = typeof response.data === 'string'
        ? response.data.substring(0, MAX_BODY_BYTES)
        : '';

      const contentLength =
        parseInt(headers['content-length'] ?? '0', 10) ||
        Buffer.byteLength(body, 'utf8');

      logger.debug(`HTTP ${response.status} in ${responseTime}ms — ${hostname}`);

      return {
        statusCode:    response.status,
        responseTime,
        finalURL,
        isRedirect,
        headers,
        body,
        contentLength,
      };

    } catch (err) {
      const responseTime = Date.now() - startTime;
      const axErr        = err as AxiosError;

      // ── Error code → human-readable ───────────────────────
      const code    = axErr.code ?? '';
      let   message = axErr.message ?? 'Request failed';

      if      (code === 'ECONNABORTED')            message = 'Connection timed out';
      else if (code === 'ETIMEDOUT')               message = 'Request timed out';
      else if (code === 'ENOTFOUND')               message = 'Domain not found (DNS)';
      else if (code === 'ECONNREFUSED')            message = 'Connection refused';
      else if (code === 'ECONNRESET')              message = 'Connection reset by server';
      else if (code === 'CERT_HAS_EXPIRED')        message = 'SSL certificate expired';
      else if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT') message = 'Self-signed certificate';
      else if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') message = 'SSL: unverifiable chain';

      // Some HTTPS-specific errors → retry over HTTP
      const httpsFail = useHTTPS && (
        code === 'ECONNREFUSED'           ||
        code === 'ERR_SSL_PROTOCOL_ERROR' ||
        message.toLowerCase().includes('ssl') ||
        message.toLowerCase().includes('tls') ||
        message.toLowerCase().includes('certificate')
      );

      if (httpsFail) {
        logger.debug(`HTTPS failed for ${hostname} (${message}), retrying over HTTP…`);
        const httpResult = await this.check(hostname, false);
        return {
          ...httpResult,
          error: `HTTPS unavailable: ${message}`,
        };
      }

      logger.warn(`HTTP check failed: ${hostname}`, { code, error: message });

      return {
        statusCode:   undefined,
        responseTime,
        finalURL:     url,
        isRedirect:   false,
        error:        message,
      };
    }
  }
}
