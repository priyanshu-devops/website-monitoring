/**
 * Type declarations for the `whoiser` WHOIS lookup package.
 * Official package ships no types; these declarations provide basic coverage.
 *
 * @see https://www.npmjs.com/package/whoiser
 */
declare module 'whoiser' {
  /** Raw WHOIS data returned for a single WHOIS server */
  type WhoisServerData = Record<string, string | string[]>;

  /** Aggregated WHOIS response keyed by WHOIS server hostname */
  type WhoisResult = Record<string, WhoisServerData>;

  /**
   * Query WHOIS information for a domain.
   *
   * @param domain   - Fully qualified domain name (e.g. "example.com")
   * @param options  - Optional query settings
   * @returns        A map of WHOIS server → parsed WHOIS fields
   */
  function whoiser(
    domain:   string,
    options?: {
      /** Connection timeout in milliseconds */
      timeout?: number;
      /** How many WHOIS servers to follow (default: 2) */
      follow?:  number;
    },
  ): Promise<WhoisResult>;

  export = whoiser;
}
