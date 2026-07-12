/**
 * DNS checking service for the Domain Monitoring System.
 *
 * Performs:
 *  1. IPv4 resolution (with IPv6 fallback)
 *  2. Nameserver (NS record) lookup for the root domain
 *
 * Uses only Node's built-in `dns` module — no external API required.
 *
 * @module services/dns/checker
 */

import * as dns from 'dns';
import { DNSInfo }     from '../../config/types';
import { logger }      from '../../utils/logger';
import { withTimeout } from '../../utils/concurrency';

// ─────────────────────────────────────────────────────────────────────────────
// DNS Checker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DNS resolution and nameserver lookup service.
 */
export class DNSChecker {

  /**
   * Attempts IPv4 resolution, falling back to IPv6 if needed.
   *
   * @param hostname   - Domain to resolve (no protocol, no path)
   * @param timeoutMs  - Resolution deadline in milliseconds
   * @returns          - Resolved IP address, or `null` on failure
   */
  async resolveIP(hostname: string, timeoutMs: number): Promise<string | null> {
    // ── IPv4 ────────────────────────────────────────────────
    try {
      const addresses = await withTimeout(
        dns.promises.resolve4(hostname),
        timeoutMs,
        `IPv4 DNS timeout for ${hostname}`,
      );
      if (addresses.length > 0) return addresses[0];
    } catch {
      // fall through to IPv6 attempt
    }

    // ── IPv6 fallback ───────────────────────────────────────
    try {
      const addresses = await withTimeout(
        dns.promises.resolve6(hostname),
        timeoutMs,
        `IPv6 DNS timeout for ${hostname}`,
      );
      if (addresses.length > 0) return addresses[0];
    } catch {
      // both failed
    }

    return null;
  }

  /**
   * Looks up the NS records for the registrable (root) part of a domain.
   *
   * e.g. `blog.example.co.uk` → looks up NS for `co.uk` then `example.co.uk`.
   * We always query the two-label root domain (`example.com`).
   *
   * @param hostname  - Domain name (may be a subdomain)
   * @returns         - Array of nameserver hostnames, or empty array on failure
   */
  async resolveNameservers(hostname: string): Promise<string[]> {
    const parts      = hostname.split('.');
    const rootDomain = parts.slice(-2).join('.');           // last two labels

    try {
      const ns = await withTimeout(
        dns.promises.resolveNs(rootDomain),
        8_000,
        `NS lookup timeout for ${rootDomain}`,
      );
      return ns.sort();
    } catch {
      return [];
    }
  }

  /**
   * Performs a full DNS check: IP resolution + nameserver lookup.
   *
   * @param hostname   - Normalised domain hostname (no protocol)
   * @param timeoutMs  - Per-operation deadline in milliseconds
   * @returns          - {@link DNSInfo} result object
   */
  async check(hostname: string, timeoutMs = 10_000): Promise<DNSInfo> {
    try {
      const ip = await this.resolveIP(hostname, timeoutMs);

      if (!ip) {
        logger.warn(`DNS resolution failed for ${hostname}`);
        return {
          resolved: false,
          error:    'Domain did not resolve to any IP address',
        };
      }

      const nameservers = await this.resolveNameservers(hostname);

      logger.debug(`DNS resolved: ${hostname} → ${ip}`, { nameservers });

      return {
        resolved:    true,
        ip,
        nameservers,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DNS check failed';

      logger.warn(`DNS error for ${hostname}`, { error: message });
      return {
        resolved: false,
        error:    message,
      };
    }
  }
}
