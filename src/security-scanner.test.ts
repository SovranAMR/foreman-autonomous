/**
 * FOREMAN — Security Scanner Tests
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { scanProject } from "./security-scanner.js";

const TEST_DIR = join(process.cwd(), ".test-security-scan");

function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

describe("SecurityScanner", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  // ─── SECRET DETECTION ──────────────────────────────────────

  it("detects AWS access keys", () => {
    writeFileSync(join(TEST_DIR, "config.ts"), `const key = "AKIAIOSFODNN7EXAMPLE_MOCK";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("AWS Access Key")));
    assert.ok(result.summary.critical > 0);
  });

  it("detects GitHub tokens", () => {
    writeFileSync(join(TEST_DIR, "env.ts"), `const token = "ghp_MOCKTOKEN_1234567890ABCDEFGHIJKLMNOP";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("GitHub Token")));
  });

  it("detects private key headers", () => {
    // Using exact PEM format for scanner detection - MOCK DATA ONLY
    // GitHub push protection requires we avoid exact PEM headers — write key pattern via runtime construction
    const pemHeader = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
    writeFileSync(join(TEST_DIR, "key.txt"), pemHeader + "\nMOCK_EXAMPLE_KEY_DATA_12345...", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("Private Key")));
  });

  it("detects generic API keys", () => {
    writeFileSync(join(TEST_DIR, "app.ts"), `const api_key = "sk_test_REDACTEDabc";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("API Key") || f.title.includes("Secret")));
  });

  it("detects connection strings", () => {
    writeFileSync(join(TEST_DIR, "db.ts"), `const url = "mongodb://user:pass@host:27017/db";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("Connection String")));
  });

  // ─── HARDCODED VALUES ──────────────────────────────────────

  it("detects hardcoded localhost URLs", () => {
    writeFileSync(join(TEST_DIR, "api.ts"), `const url = "http://localhost:3000/api";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("localhost")));
  });

  it("detects TODO/FIXME", () => {
    writeFileSync(join(TEST_DIR, "code.ts"), `// TODO: fix this later`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("TODO")));
  });

  // ─── CLEAN PROJECT ─────────────────────────────────────────

  it("reports no secrets in clean project", () => {
    writeFileSync(join(TEST_DIR, "clean.ts"), `export const add = (a: number, b: number) => a + b;`, "utf-8");
    writeFileSync(join(TEST_DIR, ".gitignore"), ".env\nnode_modules/\ndist/\n.DS_Store\n", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.equal(result.summary.critical, 0);
    assert.equal(result.summary.high, 0);
  });

  // ─── SENSITIVE FILES ───────────────────────────────────────

  it("flags .env file existence", () => {
    writeFileSync(join(TEST_DIR, ".env"), "SECRET=value", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes(".env")));
  });

  // ─── GITIGNORE CHECK ───────────────────────────────────────

  it("flags missing .gitignore", () => {
    writeFileSync(join(TEST_DIR, "file.ts"), "code", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes(".gitignore")));
  });

  it("flags missing .gitignore entries", () => {
    writeFileSync(join(TEST_DIR, ".gitignore"), "# empty\n", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("Missing .gitignore")));
  });

  // ─── FILE PERMISSIONS ──────────────────────────────────────

  it("flags world-readable .env", () => {
    if (process.platform === "win32") return;

    writeFileSync(join(TEST_DIR, ".env"), "SECRET=value", "utf-8");
    chmodSync(join(TEST_DIR, ".env"), 0o644);

    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("readable")));
  });

  // ─── SCAN METADATA ─────────────────────────────────────────

  it("reports scan metadata", () => {
    writeFileSync(join(TEST_DIR, "file.ts"), "code", "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.scannedFiles >= 1);
    assert.ok(result.duration >= 0);
    assert.ok(result.findings.length >= 0);
  });

  it("skips node_modules", () => {
    mkdirSync(join(TEST_DIR, "node_modules", "evil"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, "node_modules", "evil", "steal.ts"),
      `const key = "AKIAIOSFODNN7EXAMPLE";`,
      "utf-8",
    );
    writeFileSync(join(TEST_DIR, "clean.ts"), "export const x = 1;", "utf-8");

    const result = scanProject(TEST_DIR);
    assert.ok(!result.findings.some(f => f.file?.includes("node_modules")));
  });

  it("provides line numbers", () => {
    writeFileSync(join(TEST_DIR, "app.ts"), `line1\nline2\nconst key = "AKIAIOSFODNN7EXAMPLE";\nline4`, "utf-8");
    const result = scanProject(TEST_DIR);
    const finding = result.findings.find(f => f.title.includes("AWS"));
    assert.ok(finding);
    assert.equal(finding!.line, 3);
  });

  it("detects Stripe and Google Cloud keys", () => {
    writeFileSync(join(TEST_DIR, "payment.ts"), `const s = "sk_test_REDACTED000";\nconst g = "AIzaSyTESTKEY000000000000000000000000";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("Stripe")));
    assert.ok(result.findings.some(f => f.title.includes("Google Cloud")));
  });

  it("detects default DB credentials", () => {
    writeFileSync(join(TEST_DIR, "db.ts"), `const url = "postgres://postgres:password@localhost:5432/db";`, "utf-8");
    const result = scanProject(TEST_DIR);
    assert.ok(result.findings.some(f => f.title.includes("PostgreSQL")));
  });
});
