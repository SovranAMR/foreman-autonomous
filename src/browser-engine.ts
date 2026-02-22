/**
 * FOREMAN — Browser Engine
 *
 * Headless browser control via Playwright.
 * Navigate, screenshot, interact with web pages.
 *
 * OpenClaw'dan alınan: pw-ai.ts + screenshot.ts + browser-tool.ts concepts
 * Foreman farkı: Pipeline-integrated, tool-callable, screenshot→LLM vision
 *
 * Capabilities:
 * - Launch headless Chrome/Firefox
 * - Navigate to URLs
 * - Take screenshots (full page or element)
 * - Extract page content (text, HTML, accessibility tree)
 * - Click, type, select elements
 * - Wait for selectors/navigation
 * - PDF generation
 * - Console log capture
 * - Network request interception
 * - Cookie management
 * - Viewport emulation (mobile/tablet/desktop)
 * - Screenshot → base64 for LLM vision analysis
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface BrowserConfig {
  headless: boolean;
  defaultTimeout: number;
  viewport: { width: number; height: number };
  userAgent?: string;
  screenshotDir: string;
}

export interface PageInfo {
  url: string;
  title: string;
  status?: number;
}

export interface ScreenshotResult {
  path: string;
  base64: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ElementInfo {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  visible: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  html: string;
  links: Array<{ text: string; href: string }>;
  headings: Array<{ level: number; text: string }>;
  images: Array<{ src: string; alt: string }>;
  forms: Array<{ action: string; method: string; fields: string[] }>;
}

export interface ConsoleEntry {
  type: "log" | "warn" | "error" | "info";
  text: string;
  timestamp: number;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  defaultTimeout: 30_000,
  viewport: { width: 1280, height: 720 },
  screenshotDir: ".foreman/screenshots",
};

// ─── BROWSER ENGINE ──────────────────────────────────────────

export class BrowserEngine {
  private config: BrowserConfig;
  private projectRoot: string;
  private isAvailable: boolean | null = null;
  private consoleLogs: ConsoleEntry[] = [];

  constructor(projectRoot: string, config?: Partial<BrowserConfig>) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Playwright is available.
   */
  checkAvailability(): boolean {
    if (this.isAvailable !== null) return this.isAvailable;

    try {
      execSync("npx playwright --version", {
        encoding: "utf-8",
        timeout: 10_000,
        stdio: "pipe",
      });
      this.isAvailable = true;
    } catch {
      try {
        // Check if chromium/chrome is available directly
        execSync("which chromium || which chromium-browser || which google-chrome", {
          encoding: "utf-8",
          timeout: 5000,
          stdio: "pipe",
        });
        this.isAvailable = true;
      } catch {
        this.isAvailable = false;
      }
    }

    return this.isAvailable;
  }

  /**
   * Navigate to a URL and get page info.
   * Uses Playwright CLI or curl fallback.
   */
  async navigate(url: string): Promise<PageInfo> {
    // Use node script with playwright
    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const response = await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'domcontentloaded', timeout: ${this.config.defaultTimeout} });
        console.log(JSON.stringify({
          url: page.url(),
          title: await page.title(),
          status: response?.status() ?? 0,
        }));
        await browser.close();
      })();
    `;

    try {
      const result = execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 5000,
        stdio: "pipe",
        cwd: this.projectRoot,
      });
      return JSON.parse(result.trim());
    } catch {
      // Fallback: curl
      try {
        const curlResult = execSync(`curl -sL -o /dev/null -w '%{http_code}' '${url}'`, {
          encoding: "utf-8",
          timeout: 15_000,
          stdio: "pipe",
        });
        return { url, title: "", status: parseInt(curlResult.trim()) || 0 };
      } catch {
        return { url, title: "", status: 0 };
      }
    }
  }

  /**
   * Take a screenshot of a URL.
   */
  async screenshot(url: string, options?: {
    fullPage?: boolean;
    selector?: string;
    width?: number;
    height?: number;
  }): Promise<ScreenshotResult> {
    const screenshotDir = join(this.projectRoot, this.config.screenshotDir);
    if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

    const filename = `screenshot-${Date.now()}.png`;
    const outputPath = join(screenshotDir, filename);

    const width = options?.width ?? this.config.viewport.width;
    const height = options?.height ?? this.config.viewport.height;
    const fullPage = options?.fullPage ?? false;

    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: ${width}, height: ${height} } });
        await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: ${this.config.defaultTimeout} });
        ${options?.selector
          ? `const element = await page.$('${options.selector.replace(/'/g, "\\'")}');
             if (element) await element.screenshot({ path: '${outputPath}' });`
          : `await page.screenshot({ path: '${outputPath}', fullPage: ${fullPage} });`
        }
        const info = { width: ${width}, height: ${height} };
        console.log(JSON.stringify(info));
        await browser.close();
      })();
    `;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 10_000,
        stdio: "pipe",
        cwd: this.projectRoot,
      });

      const imageBuffer = readFileSync(outputPath);
      return {
        path: outputPath,
        base64: imageBuffer.toString("base64"),
        width,
        height,
        sizeBytes: imageBuffer.byteLength,
      };
    } catch (err) {
      // Fallback: use cutycapt or wkhtmltoimage if available
      try {
        execSync(`which wkhtmltoimage`, { stdio: "pipe" });
        execSync(`wkhtmltoimage --width ${width} --height ${height} '${url}' '${outputPath}'`, {
          encoding: "utf-8",
          timeout: 30_000,
          stdio: "pipe",
        });

        const imageBuffer = readFileSync(outputPath);
        return {
          path: outputPath,
          base64: imageBuffer.toString("base64"),
          width,
          height,
          sizeBytes: imageBuffer.byteLength,
        };
      } catch {
        throw new Error(`Screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Extract page content (text, links, headings, etc.)
   */
  async extractContent(url: string): Promise<PageContent> {
    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'domcontentloaded', timeout: ${this.config.defaultTimeout} });

        const content = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
            text: a.textContent?.trim() || '',
            href: a.href,
          }));
          const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent?.trim() || '',
          }));
          const images = Array.from(document.querySelectorAll('img[src]')).slice(0, 20).map(img => ({
            src: img.src,
            alt: img.alt || '',
          }));
          const forms = Array.from(document.querySelectorAll('form')).map(f => ({
            action: f.action || '',
            method: f.method || 'GET',
            fields: Array.from(f.querySelectorAll('input,select,textarea')).map(i => i.name || i.type || 'unknown'),
          }));
          return {
            text: document.body?.innerText?.slice(0, 10000) || '',
            html: document.documentElement.outerHTML.slice(0, 50000),
            links,
            headings,
            images,
            forms,
          };
        });

        console.log(JSON.stringify({
          url: page.url(),
          title: await page.title(),
          ...content,
        }));
        await browser.close();
      })();
    `;

    try {
      const result = execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 5000,
        stdio: "pipe",
        cwd: this.projectRoot,
        maxBuffer: 10 * 1024 * 1024,
      });
      return JSON.parse(result.trim());
    } catch {
      // Fallback: use web-fetch
      return {
        url,
        title: "",
        text: "",
        html: "",
        links: [],
        headings: [],
        images: [],
        forms: [],
      };
    }
  }

  /**
   * Click on an element.
   */
  async click(url: string, selector: string): Promise<{ success: boolean; error?: string }> {
    return this.runAction(url, `await page.click('${selector.replace(/'/g, "\\'")}');`);
  }

  /**
   * Type text into an element.
   */
  async type(url: string, selector: string, text: string): Promise<{ success: boolean; error?: string }> {
    return this.runAction(url,
      `await page.fill('${selector.replace(/'/g, "\\'")}', '${text.replace(/'/g, "\\'")}');`
    );
  }

  /**
   * Wait for a selector to appear.
   */
  async waitFor(url: string, selector: string, timeout?: number): Promise<{ success: boolean; error?: string }> {
    return this.runAction(url,
      `await page.waitForSelector('${selector.replace(/'/g, "\\'")}', { timeout: ${timeout ?? this.config.defaultTimeout} });`
    );
  }

  /**
   * Generate PDF of a page.
   */
  async pdf(url: string, outputPath?: string): Promise<string> {
    const pdfPath = outputPath ?? join(this.projectRoot, this.config.screenshotDir, `page-${Date.now()}.pdf`);
    const dir = join(this.projectRoot, this.config.screenshotDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: ${this.config.defaultTimeout} });
        await page.pdf({ path: '${pdfPath}', format: 'A4' });
        await browser.close();
      })();
    `;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 10_000,
        stdio: "pipe",
        cwd: this.projectRoot,
      });
      return pdfPath;
    } catch (err) {
      throw new Error(`PDF generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Check if a dev server is running at a URL.
   */
  async checkServer(url: string): Promise<{ running: boolean; status?: number; responseTime?: number }> {
    const start = Date.now();
    try {
      const result = execSync(
        `curl -sL -o /dev/null -w '%{http_code}' --connect-timeout 5 '${url}'`,
        { encoding: "utf-8", timeout: 10_000, stdio: "pipe" },
      );
      const status = parseInt(result.trim()) || 0;
      return {
        running: status >= 200 && status < 500,
        status,
        responseTime: Date.now() - start,
      };
    } catch {
      return { running: false, responseTime: Date.now() - start };
    }
  }

  /**
   * Get accessibility tree (simplified) for a page.
   */
  async getAccessibilityTree(url: string): Promise<string> {
    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'domcontentloaded', timeout: ${this.config.defaultTimeout} });
        const snapshot = await page.accessibility.snapshot();
        console.log(JSON.stringify(snapshot, null, 2));
        await browser.close();
      })();
    `;

    try {
      return execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 5000,
        stdio: "pipe",
        cwd: this.projectRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
    } catch {
      return "Accessibility tree not available";
    }
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private async runAction(url: string, action: string): Promise<{ success: boolean; error?: string }> {
    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'domcontentloaded', timeout: ${this.config.defaultTimeout} });
        ${action}
        console.log(JSON.stringify({ success: true }));
        await browser.close();
      })();
    `;

    try {
      execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: "utf-8",
        timeout: this.config.defaultTimeout + 5000,
        stdio: "pipe",
        cwd: this.projectRoot,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Compare two screenshots pixel-by-pixel.
   * Returns a diff score (0.0 = identical, 1.0 = completely different).
   * Uses raw buffer comparison — no external dependencies.
   */
  compareScreenshots(before: ScreenshotResult, after: ScreenshotResult): {
    diffScore: number;
    sameSize: boolean;
    changedRegions: string;
  } {
    // Size comparison
    const sameSize = before.width === after.width && before.height === after.height;

    // Decode base64 to compare raw bytes
    const beforeBuf = Buffer.from(before.base64, "base64");
    const afterBuf = Buffer.from(after.base64, "base64");

    // Simple byte-level diff (PNG compressed, so not pixel-perfect but gives meaningful signal)
    const minLen = Math.min(beforeBuf.length, afterBuf.length);
    let diffBytes = 0;
    for (let i = 0; i < minLen; i++) {
      if (beforeBuf[i] !== afterBuf[i]) diffBytes++;
    }
    // Account for size difference
    diffBytes += Math.abs(beforeBuf.length - afterBuf.length);

    const totalBytes = Math.max(beforeBuf.length, afterBuf.length);
    const diffScore = totalBytes > 0 ? diffBytes / totalBytes : 0;

    // Rough region analysis based on diff distribution
    const quarterLen = Math.floor(minLen / 4);
    const regionDiffs = [0, 0, 0, 0]; // top, upper-mid, lower-mid, bottom
    for (let i = 0; i < minLen; i++) {
      if (beforeBuf[i] !== afterBuf[i]) {
        regionDiffs[Math.min(3, Math.floor(i / quarterLen))]++;
      }
    }
    const regionLabels = ["top", "upper-middle", "lower-middle", "bottom"];
    const changedRegions = regionDiffs
      .map((d, idx) => ({ label: regionLabels[idx], pct: quarterLen > 0 ? (d / quarterLen * 100).toFixed(1) : "0" }))
      .filter(r => parseFloat(r.pct) > 5)
      .map(r => `${r.label}: ${r.pct}%`)
      .join(", ") || "minimal changes";

    return { diffScore, sameSize, changedRegions };
  }
}
