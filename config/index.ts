/**
 * Configuration loader for the Domain Monitoring System.
 * Reads all settings from environment variables and validates required fields.
 *
 * @module config/index
 */

import * as dotenv from 'dotenv';
import { AppConfig } from './types';

// Load .env file for local development (no-op in production/CI)
dotenv.config();

/**
 * Validates and loads configuration from environment variables.
 *
 * @throws {Error} If any required environment variable is missing
 * @returns {AppConfig} Fully validated application configuration
 */
function loadConfig(): AppConfig {
  const required: string[] = [
    'SPREADSHEET_ID',
    'GOOGLE_CREDENTIALS',
  ];

  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  • ${k}`).join('\n')}\n\n` +
      `Copy .env.example to .env and fill in your values.`
    );
  }

  const githubOwner =
    process.env.GITHUB_OWNER ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    'unknown';

  const githubRepo =
    process.env.GITHUB_REPO ||
    (process.env.GITHUB_REPOSITORY?.split('/')[1]) ||
    'domain-monitor';

  return {
    spreadsheetId:    process.env.SPREADSHEET_ID!.trim(),
    sheetName:        process.env.SHEET_NAME?.trim()            || 'Sheet1',
    googleCredentials: process.env.GOOGLE_CREDENTIALS!.trim(),
    githubOwner:      githubOwner.trim(),
    githubRepo:       githubRepo.trim(),
    githubBranch:     process.env.GITHUB_BRANCH?.trim()         || 'main',
    githubToken:      process.env.GITHUB_TOKEN?.trim()          || '',
    concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT   || '10', 10),
    requestTimeout:   parseInt(process.env.REQUEST_TIMEOUT     || '10000', 10),
    retryAttempts:    parseInt(process.env.RETRY_ATTEMPTS       || '2', 10),
    enableScreenshots: process.env.ENABLE_SCREENSHOTS?.toLowerCase() !== 'false',
  };
}

/**
 * Singleton application configuration object.
 * Validated at module load time — will throw immediately if config is invalid.
 */
export const config: AppConfig = loadConfig();
