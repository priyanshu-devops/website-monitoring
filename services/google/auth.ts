/**
 * Google API authentication service.
 *
 * Creates a Google Auth client from a service-account credentials JSON
 * that can be stored as either a raw JSON string or a base64-encoded string
 * (base64 is safer for GitHub Secrets as it avoids newline escaping issues).
 *
 * @module services/google/auth
 */

import { google } from 'googleapis';
import { config }  from '../../config';
import { logger }  from '../../utils/logger';

/**
 * Creates and returns an authenticated Google API auth client.
 *
 * Scopes granted:
 *  - `spreadsheets`  — read and write spreadsheet data
 *  - `drive.readonly` — list drive files (optional; for future use)
 *
 * @throws {Error} If the credentials JSON is malformed or missing required fields
 */
export function createGoogleAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  let credentials: object;

  const raw = config.googleCredentials.trim();

  try {
    // Attempt 1: raw JSON string
    credentials = JSON.parse(raw);
  } catch {
    try {
      // Attempt 2: base64-encoded JSON
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      credentials   = JSON.parse(decoded);
    } catch {
      throw new Error(
        'GOOGLE_CREDENTIALS must be a valid JSON string or base64-encoded JSON. ' +
        'See .env.example for the expected format.',
      );
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  logger.debug('Google Auth client created');
  return auth;
}
