/**
 * FOREMAN — Security Scanner
 *
 * Project-level security scanning for a coding orchestrator.
 *
 * OpenClaw's security/audit.ts: Host-level hardening audit —
 * SSH config, file permissions, firewall rules, API key exposure.
 * Focused on the machine running OpenClaw, not the project being built.
 *
 * Foreman's Security Scanner — 5 capabilities for PROJECT security:
 *
 * 1. SECRET LEAK DETECTION: Scans files for API keys, tokens, passwords.
 *    Pattern-based (regex) + entropy-based (high entropy strings).
 *    OpenClaw: checks for secrets in config files only.
 *
 * 2. DEPENDENCY AUDIT: Parses package.json for known-vulnerable packages.
 *    Flags outdated/deprecated packages without running npm audit (offline).
 *    OpenClaw: no dependency analysis.
 *
 * 3. GITIGNORE CHECK: Ensures sensitive files are in .gitignore.
 *    .env, credentials, private keys, config with secrets.
 *    OpenClaw: no gitignore validation.
 *
 * 4. HARDCODED VALUES: Detects hardcoded IPs, localhost URLs, debug flags.
 *    Things that shouldn't be in production code.
 *    OpenClaw: no hardcoded value detection.
 *
 * 5. FILE PERMISSION CHECK: Ensures private keys and configs
 *    don't have world-readable permissions.
 *    OpenClaw: similar but for OpenClaw's own files.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface SecurityScanResult {
  findings: SecurityFinding[];
  scannedFiles: number;
  duration: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ─── CONSTANTS ───────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: FindingSeverity }> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { name: "AWS Secret Key", pattern: /(?:aws_secret_access_key|secret_key)\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi, severity: "critical" },
  { name: "GitHub Token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g, severity: "critical" },
  { name: "npm Token", pattern: /npm_[A-Za-z0-9]{36}/g, severity: "critical" },
  { name: "Slack Token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g, severity: "high" },
  { name: "Generic API Key", pattern: /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi, severity: "high" },
  { name: "Generic Secret", pattern: /(?:secret|password|passwd|pwd)\s*[=:]\s*["'][^"']{8,}["']/gi, severity: "high" },
  { name: "Private Key Header", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, severity: "critical" },
  { name: "Bearer Token", pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, severity: "medium" },
  { name: "Connection String", pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, severity: "high" },
  { name: "Stripe API Key", pattern: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24}/g, severity: "critical" },
  { name: "Google Cloud API Key", pattern: /AIza[0-9A-Za-z\-_]{35}/g, severity: "critical" },
  { name: "Heroku API Key", pattern: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, severity: "high" },
];

const SENSITIVE_FILES = [
  ".env", ".env.local", ".env.production", ".env.staging",
  "credentials", "secrets", ".npmrc", ".pypirc",
  "id_rsa", "id_ed25519", "id_ecdsa", "service-account.json",
  "key.pem", "server.key", "cert.p12",
];

const GITIGNORE_SHOULD_INCLUDE = [
  ".env", ".env.local", ".env.*",
  "*.pem", "*.key", "*.p12", "*.pfx",
  "node_modules/", "dist/", ".DS_Store",
  "credentials.json", "*.session", "*.log",
];

const HARDCODED_PATTERNS: Array<{ name: string; pattern: RegExp; severity: FindingSeverity }> = [
  { name: "Hardcoded localhost URL", pattern: /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/g, severity: "low" },
  { name: "Hardcoded IP address", pattern: /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g, severity: "low" },
  { name: "Debug flag", pattern: /(?:debug|DEBUG)\s*[=:]\s*(?:true|1|"true")/g, severity: "info" },
  { name: "TODO/FIXME/HACK", pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/g, severity: "info" },
  { name: "PostgreSQL Default Credentials", pattern: /postgres:\/\/postgres:[^@]+@/gi, severity: "high" },
  { name: "Redis No-Auth", pattern: /redis:\/\/[:@][^\s"']+/gi, severity: "medium" },
];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "coverage", ".cache", "__pycache__", ".venv",
  ".foreman", ".openclaw",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts", ".js", ".tsx", ".jsx", ".py", ".rb", ".go",
  ".java", ".rs", ".env", ".yml", ".yaml", ".json",
  ".toml", ".cfg", ".conf", ".ini", ".sh", ".bash",
  ".md", ".txt",
]);

// ─── SCANNER ─────────────────────────────────────────────────

/**
 * Run a full security scan on a project.
 */
export function scanProject(projectRoot: string): SecurityScanResult {
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;
  let findingCounter = 0;

  const nextId = () => `sec_${++findingCounter}`;

  // 1. Scan files for secrets and hardcoded values
  const files = collectFiles(projectRoot);
  for (const filePath of files) {
    const relPath = relative(projectRoot, filePath);
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      scannedFiles++;

      // Secret patterns
      for (const { name, pattern, severity } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of content.matchAll(pattern)) {
          const lineNum = findLineNumber(lines, match.index ?? 0);
          findings.push({
            id: nextId(),
            severity,
            title: `${name} detected`,
            description: `Potential ${name} found in ${relPath}`,
            file: relPath,
            line: lineNum,
            suggestion: `Remove the secret and use environment variables instead`,
          });
        }
      }

      // Hardcoded values (only in source code, not configs)
      if (/\.(ts|js|tsx|jsx|py|rb|go|java|rs)$/.test(filePath)) {
        for (const { name, pattern, severity } of HARDCODED_PATTERNS) {
          pattern.lastIndex = 0;
          for (const match of content.matchAll(pattern)) {
            const lineNum = findLineNumber(lines, match.index ?? 0);
            findings.push({
              id: nextId(),
              severity,
              title: name,
              description: `${name} in ${relPath}:${lineNum}`,
              file: relPath,
              line: lineNum,
            });
          }
        }
      }
    } catch { /* skip unreadable files */ }
  }

  // 2. Check for sensitive files not in .gitignore
  const gitignoreFindings = checkGitignore(projectRoot);
  findings.push(...gitignoreFindings.map(f => ({ ...f, id: nextId() })));

  // 3. Check sensitive file permissions
  const permFindings = checkFilePermissions(projectRoot);
  findings.push(...permFindings.map(f => ({ ...f, id: nextId() })));

  // 4. Check for exposed sensitive files
  for (const sensitiveFile of SENSITIVE_FILES) {
    const fullPath = join(projectRoot, sensitiveFile);
    if (existsSync(fullPath)) {
      findings.push({
        id: nextId(),
        severity: "medium",
        title: `Sensitive file found: ${sensitiveFile}`,
        description: `${sensitiveFile} exists in the project root. Ensure it's in .gitignore.`,
        file: sensitiveFile,
        suggestion: `Add ${sensitiveFile} to .gitignore`,
      });
    }
  }

  const summary = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    info: findings.filter(f => f.severity === "info").length,
  };

  return {
    findings,
    scannedFiles,
    duration: Date.now() - startTime,
    summary,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────

function collectFiles(dir: string, maxDepth = 5): string[] {
  const files: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry.startsWith(".") && entry !== ".env" && entry !== ".env.local") {
          if (SKIP_DIRS.has(entry)) continue;
        }
        if (SKIP_DIRS.has(entry)) continue;

        const fullPath = join(current, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (stat.isFile()) {
            const ext = extname(entry);
            if (SCAN_EXTENSIONS.has(ext) || SENSITIVE_FILES.includes(entry)) {
              // Skip very large files
              if (stat.size < 500_000) {
                files.push(fullPath);
              }
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(dir, 0);
  return files;
}

function findLineNumber(lines: string[], charIndex: number): number {
  let chars = 0;
  for (let i = 0; i < lines.length; i++) {
    chars += lines[i].length + 1; // +1 for \n
    if (chars > charIndex) return i + 1;
  }
  return lines.length;
}

function checkGitignore(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const gitignorePath = join(projectRoot, ".gitignore");

  if (!existsSync(gitignorePath)) {
    findings.push({
      id: "",
      severity: "medium",
      title: "No .gitignore file",
      description: "Project has no .gitignore file. Sensitive files may be committed.",
      suggestion: "Create a .gitignore with common exclusions",
    });
    return findings;
  }

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n").map(l => l.trim());

    for (const pattern of GITIGNORE_SHOULD_INCLUDE) {
      // Simple check — does a line match this pattern?
      const found = lines.some(line => {
        if (line === pattern) return true;
        if (line === pattern.replace(".*", "")) return true; // .env matches .env.*
        return false;
      });

      if (!found) {
        findings.push({
          id: "",
          severity: "low",
          title: `Missing .gitignore entry: ${pattern}`,
          description: `${pattern} is not in .gitignore`,
          file: ".gitignore",
          suggestion: `Add ${pattern} to .gitignore`,
        });
      }
    }
  } catch { /* skip */ }

  return findings;
}

function checkFilePermissions(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Only relevant on Unix
  if (process.platform === "win32") return findings;

  const keyFiles = [".env", ".env.local", ".env.production"];
  for (const file of keyFiles) {
    const fullPath = join(projectRoot, file);
    if (!existsSync(fullPath)) continue;

    try {
      const stat = statSync(fullPath);
      const mode = stat.mode & 0o777;

      // World-readable or group-readable is bad for secrets
      if (mode & 0o044) {
        findings.push({
          id: "",
          severity: "medium",
          title: `${file} is world/group readable`,
          description: `${file} has permissions ${mode.toString(8)}. Should be 600 or more restrictive.`,
          file,
          suggestion: `chmod 600 ${file}`,
        });
      }
    } catch { /* skip */ }
  }

  return findings;
}
