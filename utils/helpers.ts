/**
 * Pure utility helpers for the Domain Monitoring System.
 *
 * Covers:
 *  - Domain normalisation
 *  - Date / time formatting
 *  - HTML parsing (title, meta)
 *  - Technology detection (server, WordPress, Cloudflare, CDN)
 *  - Hosting provider detection via reverse-DNS
 *  - SSL grade computation
 *  - Website status derivation
 *
 * @module utils/helpers
 */

import * as dns from 'dns';
import { SSLInfo } from '../config/types';

// ─────────────────────────────────────────────────────────────────────────────
// Domain & URL Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a raw domain string by stripping protocols, www prefix,
 * and trailing paths so that checkers always receive a clean hostname.
 *
 * @example
 * normalizeDomain("https://www.Example.COM/path") → "example.com"
 */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')   // strip protocol
    .replace(/^www\./i, '')          // strip www
    .split('/')[0]                   // strip path
    .split('?')[0]                   // strip query
    .split('#')[0];                  // strip fragment
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / Time Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a date as a YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Returns the current time formatted as HH:MM:SS in IST (Asia/Kolkata).
 */
export function formatTimeIST(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone:  'Asia/Kolkata',
    hour12:    false,
    hour:      '2-digit',
    minute:    '2-digit',
    second:    '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the text content of the `<title>` element from an HTML string.
 * Returns an empty string if no title is found.
 */
export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim().substring(0, 200) : '';
}

/**
 * Extracts the `<meta name="description">` content from an HTML string.
 * Handles both attribute orderings.
 */
export function extractMetaDescription(html: string): string {
  // name=... content=...
  let m = html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (!m) {
    // content=... name=...
    m = html.match(/<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  }
  return m ? m[1].trim().substring(0, 300) : '';
}

/**
 * Extracts the `og:title` Open Graph meta value from an HTML string.
 */
export function extractMetaTitle(html: string): string {
  let m = html.match(/<meta\s[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (!m) {
    m = html.match(/<meta\s[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  }
  return m ? m[1].trim().substring(0, 200) : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Technology Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects WordPress by scanning HTML for well-known WP fingerprints.
 */
export function detectWordPress(html: string, headers: Record<string, string> = {}): boolean {
  return (
    html.includes('wp-content/')       ||
    html.includes('wp-includes/')      ||
    html.includes('/wp-json/')         ||
    html.includes('wp-emoji-release')  ||
    /content=["']WordPress/i.test(html) ||
    (headers['x-powered-by'] || '').toLowerCase().includes('wordpress')
  );
}

/**
 * Detects Cloudflare by checking for Cloudflare-specific response headers.
 */
export function detectCloudflare(headers: Record<string, string> = {}): boolean {
  return !!(
    headers['cf-ray']            ||
    headers['cf-cache-status']   ||
    headers['cf-request-id']     ||
    (headers['server'] || '').toLowerCase().includes('cloudflare')
  );
}

/**
 * Detects CDN provider from response headers.
 *
 * @param headers      - Lowercase response headers map
 * @param isCloudflare - Pass-through from {@link detectCloudflare}
 * @returns CDN provider name or "None"
 */
export function detectCDN(
  headers:      Record<string, string> = {},
  isCloudflare  = false,
): string {
  if (isCloudflare)                                              return 'Cloudflare';
  if (headers['x-amz-cf-id'] || headers['x-amz-request-id'])   return 'AWS CloudFront';
  if (headers['x-fastly-request-id'])                            return 'Fastly';
  if (headers['via']?.toLowerCase().includes('varnish'))         return 'Varnish/Fastly';
  if (headers['akamai-grn'] || headers['x-akamai-transformed']) return 'Akamai';
  if ((headers['server'] || '').toLowerCase().includes('bunny')) return 'BunnyCDN';
  if (headers['x-cdn'])                                          return headers['x-cdn'];
  if (headers['x-cache'] && !headers['x-cache'].includes('MISS')) return 'CDN (Generic)';
  return 'None';
}

/**
 * Detects the web-server technology and CMS platform from headers and HTML body.
 * Returns a comma-separated string of identified technologies.
 */
export function detectTechStack(
  headers: Record<string, string> = {},
  html:    string                 = '',
): string {
  const tech: Set<string> = new Set();

  const server     = (headers['server']         || '').toLowerCase();
  const poweredBy  = (headers['x-powered-by']   || '').toLowerCase();
  const via        = (headers['via']             || '').toLowerCase();

  // ── Web Servers ────────────────────────────────────────────
  if (/nginx/i.test(server))       tech.add('Nginx');
  if (/apache/i.test(server))      tech.add('Apache');
  if (/litespeed/i.test(server))   tech.add('LiteSpeed');
  if (/\biis\b/i.test(server))     tech.add('IIS');
  if (/openresty/i.test(server))   tech.add('OpenResty');
  if (/caddy/i.test(server))       tech.add('Caddy');
  if (/gunicorn/i.test(server))    tech.add('Gunicorn');
  if (/cloudflare/i.test(server))  tech.add('Cloudflare');
  if (/varnish/i.test(via))        tech.add('Varnish');

  // ── Languages / Frameworks ─────────────────────────────────
  if (/php/i.test(poweredBy))                   tech.add('PHP');
  if (/asp\.net/i.test(poweredBy))              tech.add('ASP.NET');
  if (/express/i.test(poweredBy))               tech.add('Express.js');
  if (/next\.js/i.test(poweredBy))              tech.add('Next.js');

  // ── CMS / Platforms ────────────────────────────────────────
  if (html.includes('wp-content/') || html.includes('wp-includes/')) tech.add('WordPress');
  if (html.includes('Drupal.settings') || html.includes('/sites/default/files/')) tech.add('Drupal');
  if (html.includes('joomla') || html.includes('/components/com_')) tech.add('Joomla');
  if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme')) tech.add('Shopify');
  if (html.includes('static.wixstatic.com') || html.includes('_wix_')) tech.add('Wix');
  if (html.includes('squarespace.com') || html.includes('static1.squarespace.com')) tech.add('Squarespace');
  if (html.includes('ghost-url') || html.includes('content/themes/')) tech.add('Ghost');
  if (html.includes('webflow.com')) tech.add('Webflow');

  return tech.size > 0 ? [...tech].join(', ') : 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Website Status Derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts raw HTTP check data into a human-readable website status string.
 *
 * @param statusCode  - HTTP response code (undefined = no response)
 * @param isRedirect  - Whether the response followed a redirect chain
 * @param error       - Error message from the checker (if any)
 */
export function determineWebsiteStatus(
  statusCode?: number,
  isRedirect?: boolean,
  error?:      string,
): string {
  if (error && !statusCode) return 'Offline';
  if (!statusCode)           return 'Offline';

  if (isRedirect && statusCode >= 200 && statusCode < 400) return 'Redirect';
  if (statusCode >= 200 && statusCode < 300)                return 'Online';
  if (statusCode >= 300 && statusCode < 400)                return 'Redirect';
  if (statusCode === 401)                                    return 'Online (Auth Required)';
  if (statusCode === 403)                                    return `Error 403 (Forbidden)`;
  if (statusCode === 404)                                    return `Error 404 (Not Found)`;
  if (statusCode === 429)                                    return `Error 429 (Rate Limited)`;
  if (statusCode === 500)                                    return `Error 500 (Server Error)`;
  if (statusCode === 503)                                    return `Error 503 (Unavailable)`;
  if (statusCode === 521)                                    return `Error 521 (Cloudflare: Origin Down)`;
  if (statusCode === 522)                                    return `Error 522 (Cloudflare: Connection Timed Out)`;
  if (statusCode === 523)                                    return `Error 523 (Cloudflare: Origin Unreachable)`;
  if (statusCode >= 400)                                     return `Error ${statusCode}`;
  return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Hosting Provider Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Performs a reverse-DNS lookup on `ip` and pattern-matches the PTR record
 * against known hosting provider hostnames.
 *
 * Fully offline — no external API required.
 *
 * @param ip - IPv4 or IPv6 address
 * @returns Best-effort hosting provider name
 */
export async function detectHostingProvider(ip: string): Promise<string> {
  try {
    const hostnames = await dns.promises.reverse(ip);
    const ptr       = hostnames.join(' ').toLowerCase();

    if (/amazonaws\.com/.test(ptr))                         return 'Amazon AWS';
    if (/google(usercontent|cloud|apis)?\.com/.test(ptr))   return 'Google Cloud';
    if (/azure|windows\.net|microsoft\.com/.test(ptr))      return 'Microsoft Azure';
    if (/cloudflare\.com/.test(ptr))                        return 'Cloudflare';
    if (/digitalocean\.com/.test(ptr))                      return 'DigitalOcean';
    if (/linode\.com/.test(ptr))                            return 'Linode/Akamai';
    if (/vultr\.com/.test(ptr))                             return 'Vultr';
    if (/ovh(cloud)?\./.test(ptr))                          return 'OVH';
    if (/hetzner\./.test(ptr))                              return 'Hetzner';
    if (/godaddy\.com/.test(ptr))                           return 'GoDaddy';
    if (/bluehost\.com/.test(ptr))                          return 'Bluehost';
    if (/siteground\./.test(ptr))                           return 'SiteGround';
    if (/wpengine\.com/.test(ptr))                          return 'WP Engine';
    if (/kinsta\./.test(ptr))                               return 'Kinsta';
    if (/fastly\./.test(ptr))                               return 'Fastly';
    if (/akamai(edge)?\./.test(ptr))                        return 'Akamai';
    if (/rackspace\./.test(ptr))                            return 'Rackspace';
    if (/hostgator\./.test(ptr))                            return 'HostGator';
    if (/dreamhost\./.test(ptr))                            return 'DreamHost';
    if (/namecheap\./.test(ptr))                            return 'Namecheap';
    if (/hostinger\./.test(ptr))                            return 'Hostinger';
    if (/bigrock\./.test(ptr))                              return 'BigRock';
    if (/liquidweb\./.test(ptr))                            return 'Liquid Web';
    if (/a2hosting\./.test(ptr))                            return 'A2 Hosting';

    // Return shortened PTR as a best-effort hint
    const parts = ptr.split('.');
    return parts.length >= 2 ? `${parts.at(-2)}.${parts.at(-1)}` : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSL Grade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a basic SSL grade (A+ / A / B / C / F) from certificate properties.
 *
 * | Grade | Criteria |
 * |-------|----------|
 * | A+    | Trusted, TLSv1.3, > 30 days remaining |
 * | A     | Trusted, TLSv1.2, > 30 days remaining |
 * | B     | Trusted, older TLS or 14–30 days remaining |
 * | C     | Untrusted chain or < 14 days remaining |
 * | F     | Invalid / expired / unavailable |
 */
export function determineSSLGrade(ssl: Pick<SSLInfo, 'valid' | 'daysRemaining' | 'protocol' | 'authorized'>): string {
  if (!ssl.valid)                                      return 'F';
  if (!ssl.authorized)                                 return 'C';
  if (ssl.daysRemaining !== undefined && ssl.daysRemaining < 0) return 'F';
  if (ssl.daysRemaining !== undefined && ssl.daysRemaining < 14) return 'C';
  if (ssl.daysRemaining !== undefined && ssl.daysRemaining < 30) return 'B';
  if (ssl.protocol?.includes('TLSv1.3'))               return 'A+';
  if (ssl.protocol?.includes('TLSv1.2'))               return 'A';
  return 'B';
}

// ─────────────────────────────────────────────────────────────────────────────
// Byte Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a byte count to a human-readable KB string.
 *
 * @example bytesToKB(43520) → "42.50 KB"
 */
export function bytesToKB(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / 1024).toFixed(2)} KB`;
}
