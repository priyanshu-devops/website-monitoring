/**
 * SSL/TLS certificate inspection service.
 *
 * Uses Node's built-in `tls` module to open a TLS connection, extract the
 * peer certificate, and return structured information without any external
 * library or paid API.
 *
 * Handled error conditions:
 *  - Certificate expired
 *  - Self-signed certificate
 *  - Untrusted chain (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
 *  - Connection refused on port 443
 *  - DNS failure
 *  - Connection timeout
 *  - No certificate returned
 *
 * @module services/ssl/checker
 */

import * as tls   from 'tls';
import { SSLInfo } from '../../config/types';
import { logger }  from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// SSL Checker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TLS certificate inspection service.
 */
export class SSLChecker {

  /**
   * Opens a TLS connection to `hostname:443`, reads the peer certificate,
   * and returns structured SSL information.
   *
   * The check is **non-blocking** (uses raw TLS socket) and fully contained
   * within a single Promise that always resolves (never rejects), so a
   * failure for one domain never crashes the monitoring loop.
   *
   * @param hostname   - Domain to check (normalised, no protocol)
   * @param timeoutMs  - Hard deadline for the TLS handshake
   * @returns          - {@link SSLInfo} — valid or error state
   */
  check(hostname: string, timeoutMs = 10_000): Promise<SSLInfo> {
    return new Promise((resolve) => {
      let settled = false;

      /** Settles the promise exactly once. */
      const settle = (result: SSLInfo): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      // Hard deadline — fires if TLS handshake never completes
      const timer = setTimeout(() => {
        socket.destroy();
        settle({ valid: false, error: 'TLS connection timed out' });
      }, timeoutMs);

      const socket = tls.connect(
        {
          host:               hostname,
          port:               443,
          servername:         hostname,         // SNI
          rejectUnauthorized: false,            // we assess validity ourselves
          timeout:            timeoutMs,
        },
        () => {
          // TLS handshake completed — extract certificate
          try {
            const cert       = socket.getPeerCertificate(false);
            const authorized = socket.authorized;
            const protocol   = socket.getProtocol() ?? undefined;

            clearTimeout(timer);
            socket.destroy();

            if (!cert || !cert.valid_to) {
              settle({ valid: false, error: 'Server returned no certificate' });
              return;
            }

            const expiryDate    = new Date(cert.valid_to);
            const now           = Date.now();
            const daysRemaining = Math.ceil(
              (expiryDate.getTime() - now) / 86_400_000,
            );

            const getFirst = (val: any) => (Array.isArray(val) ? val[0] : val);
            const issuer =
              getFirst(cert.issuer?.O)  ||
              getFirst(cert.issuer?.CN) ||
              'Unknown';

            settle({
              valid:         true,
              expiryDate:    expiryDate.toISOString().split('T')[0],
              daysRemaining,
              issuer,
              protocol,
              authorized:    authorized === true,
            });
          } catch (parseErr) {
            clearTimeout(timer);
            socket.destroy();
            settle({
              valid: false,
              error: parseErr instanceof Error ? parseErr.message : 'Certificate parse error',
            });
          }
        },
      );

      socket.on('error', (err) => {
        clearTimeout(timer);
        socket.destroy();

        // Translate common OpenSSL codes to human-readable messages
        const code    = (err as NodeJS.ErrnoException).code ?? '';
        const message =
          code === 'CERT_HAS_EXPIRED'                     ? 'Certificate has expired'             :
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT'          ? 'Self-signed certificate'             :
          code === 'SELF_SIGNED_CERT_IN_CHAIN'            ? 'Self-signed certificate in chain'    :
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'      ? 'Unverifiable certificate chain'      :
          code === 'CERT_UNTRUSTED'                       ? 'Certificate is untrusted'            :
          code === 'ECONNREFUSED'                         ? 'Port 443 connection refused'         :
          code === 'ENOTFOUND'                            ? 'Host not found'                      :
          code === 'ETIMEDOUT'                            ? 'TLS connection timed out'            :
          err.message;

        settle({ valid: false, error: message });
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        socket.destroy();
        settle({ valid: false, error: 'TLS socket timed out' });
      });
    });
  }
}
