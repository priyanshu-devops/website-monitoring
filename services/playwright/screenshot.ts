/**
 * Playwright screenshot service for the Domain Monitoring System.
 *
 * Strategy:
 *  1. Launch a single shared Chromium browser (headless)
 *  2. For each domain: open a new context+page → navigate → screenshot → thumbnail
 *  3. Save files to ./screenshots/ locally
 *  4. Return pre-computed GitHub raw URLs (files are committed to the repo
 *     in a single git commit at the end of the GitHub Actions workflow)
 *
 * If a screenshot fails, the method checks whether a previous screenshot
 * already exists on disk and returns its URL — preserving the last-known
 * good screenshot without overwriting it.
 *
 * @module services/playwright/screenshot
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import sharp  from 'sharp';
import * as path from 'path';
import * as fs   from 'fs';
import { ScreenshotInfo } from '../../config/types';
import { config }          from '../../config';
import { logger }          from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCREENSHOTS_DIR   = path.join(process.cwd(), 'screenshots');
const THUMBNAIL_WIDTH   = 400;
const THUMBNAIL_HEIGHT  = 300;
const PAGE_LOAD_TIMEOUT = 20_000;   // ms — Playwright navigation timeout

// Ensure screenshots directory exists on first import
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Screenshot Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages a shared Playwright Chromium browser and captures per-domain screenshots.
 */
export class ScreenshotService {
  private browser: Browser | null = null;

  // ─── Lifecycle ─────────────────────────────────────────────

  /**
   * Launches the headless Chromium browser.
   * Must be called before the first {@link capture} call.
   */
  async initialize(): Promise<void> {
    logger.info('Launching Chromium browser…');

    this.browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',          // required in Docker / Actions
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
      ],
    });

    logger.success('Chromium browser ready');
  }

  /**
   * Closes the Chromium browser.
   * Always call this in a `finally` block to prevent browser leaks.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      logger.info('Chromium browser closed');
    }
  }

  // ─── URL Computation ───────────────────────────────────────

  /**
   * Computes the public GitHub raw URL for a screenshot file.
   * The URL is valid once the CI workflow's git-commit step runs.
   */
  private githubRawUrl(filename: string): string {
    const v = Date.now();
    return (
      `https://raw.githubusercontent.com` +
      `/${config.githubOwner}` +
      `/${config.githubRepo}` +
      `/${config.githubBranch}` +
      `/screenshots/${filename}?v=${v}`
    );
  }

  /**
   * Produces a filesystem-safe filename from a domain name.
   * e.g. `example.co.uk` → `example.co.uk` (dots kept, slashes removed)
   */
  private safeFilename(domain: string): string {
    return domain.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // ─── Capture ───────────────────────────────────────────────

  /**
   * Captures a 1366×768 viewport screenshot of the domain's homepage,
   * resizes it to a 400×300 thumbnail using sharp, and returns the
   * expected public URLs.
   *
   * @param domain     - Normalised domain hostname (no protocol)
   * @param timeoutMs  - Navigation deadline in milliseconds
   * @returns          - {@link ScreenshotInfo} with URL pair or error
   */
  async capture(domain: string, timeoutMs = PAGE_LOAD_TIMEOUT): Promise<ScreenshotInfo> {
    if (!this.browser) {
      return { error: 'Browser not initialised — call initialize() first' };
    }

    const safe         = this.safeFilename(domain);
    const screenshotFile  = `${safe}.png`;
    const thumbnailFile   = `${safe}_thumb.png`;
    const screenshotPath  = path.join(SCREENSHOTS_DIR, screenshotFile);
    const thumbnailPath   = path.join(SCREENSHOTS_DIR, thumbnailFile);

    let context: BrowserContext | null = null;
    let page:    Page           | null = null;

    try {
      context = await this.browser.newContext({
        viewport:            { width: 1366, height: 768 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        ignoreHTTPSErrors:   true,
        javaScriptEnabled:   true,
        locale:              'en-US',
      });

      page = await context.newPage();

      // ── Block heavy non-visual resources ─────────────────
      await page.route(
        '**/*.{mp4,webm,ogg,mp3,wav,flac,aac,woff,woff2,ttf,otf,eot}',
        (route) => route.abort(),
      );

      // ── Navigate ─────────────────────────────────────────
      try {
        await page.goto(`https://${domain}`, {
          timeout:   timeoutMs,
          waitUntil: 'domcontentloaded',
        });
      } catch {
        // Try HTTP fallback
        await page.goto(`http://${domain}`, {
          timeout:   timeoutMs,
          waitUntil: 'domcontentloaded',
        });
      }

      // Allow 1.5 s for JS-driven content to render
      await page.waitForTimeout(1_500);

      // ── Capture full screenshot ───────────────────────────
      await page.screenshot({
        path: screenshotPath,
        clip: { x: 0, y: 0, width: 1366, height: 768 },
        type: 'png',
      });

      // ── Generate compressed thumbnail ────────────────────
      await sharp(screenshotPath)
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
          fit:      'cover',
          position: 'top',
        })
        .png({ compressionLevel: 8 })
        .toFile(thumbnailPath);

      logger.success(`Screenshot captured: ${domain}`);

      return {
        url:          this.githubRawUrl(screenshotFile),
        thumbnailUrl: this.githubRawUrl(thumbnailFile),
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Screenshot failed';
      logger.warn(`Screenshot failed for ${domain}: ${message}`);

      // ── Preserve previous screenshot if it exists ────────
      if (fs.existsSync(screenshotPath)) {
        logger.info(`Using previous screenshot for ${domain}`);
        return {
          url:          this.githubRawUrl(screenshotFile),
          thumbnailUrl: fs.existsSync(thumbnailPath)
            ? this.githubRawUrl(thumbnailFile)
            : undefined,
        };
      }

      return { error: message };

    } finally {
      await page?.close().catch(() => {});
      await context?.close().catch(() => {});
    }
  }
}
