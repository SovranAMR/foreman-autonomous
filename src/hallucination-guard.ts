/**
 * FOREMAN — Hallucination Guard
 *
 * Universal post-processing guard that detects when the LLM claims
 * to have performed actions (file writes, commits, pushes, test runs, etc.)
 * without actually making tool calls.
 *
 * This is a code-level safeguard — not a prompt-level suggestion.
 * The guard intercepts every response before it reaches the user.
 *
 * Three detection modes:
 *   1. Claim Detection — scans response for action claims (✅, YAZILDI, committed, etc.)
 *   2. Tool Call Audit — tracks which tools were actually invoked during the turn
 *   3. Verification Injection — if claims detected without matching tool calls,
 *      injects a warning and optionally strips the false claims
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  timestamp: number;
}

export interface GuardResult {
  /** Whether hallucination was detected */
  detected: boolean;
  /** The (possibly modified) response text */
  text: string;
  /** What was detected */
  violations: Violation[];
  /** Summary for logging */
  summary: string;
}

export interface Violation {
  type: ViolationType;
  claim: string;
  line: string;
  severity: "warning" | "critical";
}

export type ViolationType =
  | "file_write_claim"      // Claims to have written/created a file
  | "file_edit_claim"       // Claims to have edited a file
  | "commit_claim"          // Claims to have committed
  | "push_claim"            // Claims to have pushed
  | "test_claim"            // Claims tests passed
  | "build_claim"           // Claims build succeeded
  | "delete_claim"          // Claims to have deleted something
  | "install_claim"         // Claims to have installed something
  | "deploy_claim"          // Claims to have deployed
  | "generic_completion"    // Generic "done/completed" without evidence
  ;

// ─── CLAIM PATTERNS ─────────────────────────────────────────

interface ClaimPattern {
  type: ViolationType;
  patterns: RegExp[];
  requiredTools: string[];  // At least one of these tools must have been called
  severity: "warning" | "critical";
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    type: "file_write_claim",
    patterns: [
      /(?:✅|✔)\s*(?:dosya|file).*(?:yazıldı|yazildi|written|created|oluşturuldu|olusturuldu)/i,
      /(?:✅|✔)\s*.*\.(?:ts|js|tsx|jsx|py|rs|go|java|c|cpp|h|css|html|md|json|yaml|yml|toml|sh)\s*(?:—|[-–])\s*(?:yazıldı|yazildi|written|created)/i,
      /write_file.*(?:✅|✔|başarılı|basarili|success)/i,
      /dosya(?:yı|yi|ları|lari)?\s+(?:yazdım|yazdim|oluşturdum|olusturdum|yarattım|yarattim)/i,
      /(?:file|dosya)\s+\d+\/\d+.*(?:yazıldı|yazildi|written)/i,
      /(?:YAZILDI|YAZILDI|CREATED|WRITTEN)\s*\(\d+\s*satır\)/i,
    ],
    requiredTools: ["write_file", "batch_write", "bash"],
    severity: "critical",
  },
  {
    type: "file_edit_claim",
    patterns: [
      /(?:✅|✔)\s*.*(?:düzenlendi|duzenlendi|edited|updated|güncellendi|guncellendi)/i,
      /edit_file.*(?:✅|✔|başarılı|basarili|success)/i,
      /(?:düzenledim|duzenledim|güncelledim|guncelledim|değiştirdim|degistirdim)/i,
    ],
    requiredTools: ["edit_file", "write_file", "bash"],
    severity: "critical",
  },
  {
    type: "commit_claim",
    patterns: [
      /(?:✅|✔)\s*(?:commit|COMMIT).*(?:yapıldı|yapildi|done|made|created|atıldı|atildi)/i,
      /commit.*(?:hash|SHA|sha)?\s*:?\s*[a-f0-9]{7,40}/i,
      /git\s+commit.*(?:✅|✔|başarılı|basarili|success)/i,
      /(?:COMMIT YAPILDI|COMMITTED|commit attım|commit attim)/i,
    ],
    requiredTools: ["git_commit", "bash"],
    severity: "critical",
  },
  {
    type: "push_claim",
    patterns: [
      /(?:✅|✔)\s*(?:push|PUSH).*(?:yapıldı|yapildi|done|completed|tamamlandı|tamamlandi)/i,
      /git\s+push.*(?:✅|✔|başarılı|basarili|success)/i,
      /(?:PUSH TAMAMLANDI|PUSHED|push yaptım|push yaptim|push ettim)/i,
      /github\.com\/.*\/commit\/[a-f0-9]+/i,
    ],
    requiredTools: ["bash"],  // push is always via bash
    severity: "critical",
  },
  {
    type: "test_claim",
    patterns: [
      /(?:✅|✔)\s*(?:test|TEST).*(?:geçti|gecti|passed|başarılı|basarili|success)/i,
      /\d+\/\d+\s+test.*(?:geçti|gecti|passed)/i,
      /(?:all|tüm|hepsi).*test.*(?:geçti|gecti|passed|✅|✔)/i,
      /test\s+(?:sonucu|result|output).*(?:✅|✔|başarılı|basarili)/i,
    ],
    requiredTools: ["bash"],  // tests run via bash
    severity: "critical",
  },
  {
    type: "build_claim",
    patterns: [
      /(?:✅|✔)\s*(?:build|BUILD|derleme).*(?:başarılı|basarili|success|passed|tamamlandı|tamamlandi)/i,
      /(?:build|compile|derleme).*(?:✅|✔|başarılı|basarili|success)/i,
    ],
    requiredTools: ["bash"],
    severity: "warning",
  },
  {
    type: "delete_claim",
    patterns: [
      /(?:✅|✔)\s*.*(?:silindi|deleted|removed|kaldırıldı|kaldirildi)/i,
      /(?:sildim|kaldırdım|kaldirdim|temizledim)/i,
    ],
    requiredTools: ["bash", "delete_file"],
    severity: "warning",
  },
  {
    type: "install_claim",
    patterns: [
      /(?:✅|✔)\s*.*(?:yüklendi|yuklendi|installed|kuruldu)/i,
      /npm\s+install.*(?:✅|✔|başarılı|basarili|success)/i,
      /(?:yükledim|yukledim|kurdum)/i,
    ],
    requiredTools: ["bash"],
    severity: "warning",
  },
  {
    type: "deploy_claim",
    patterns: [
      /(?:✅|✔)\s*.*(?:deploy|DEPLOY|yayınlandı|yayinlandi|published)/i,
      /(?:deploy ettim|yayınladım|yayinladim|publish ettim)/i,
    ],
    requiredTools: ["bash"],
    severity: "critical",
  },
  {
    type: "generic_completion",
    patterns: [
      /toplam:\s*\d[\d,\.]*\s*satır\s*(?:yeni\s*)?kod/i,
      /eklenen\s+dosyalar?\s*:/i,
      /(?:✅|✔)\s*(?:tamamlandı|tamamlandi|completed|done|bitti|finished)\s*!/i,
    ],
    requiredTools: ["write_file", "edit_file", "bash", "batch_write", "git_commit"],
    severity: "warning",
  },
];

// ─── STATUS EMOJI PATTERNS ──────────────────────────────────
// Lines that look like status reports but have no backing tool call

const STATUS_LINE_PATTERN = /^[✅✔☑️]\s+(?:Dosya|File|DOSYA|Commit|COMMIT|Push|PUSH|Test|TEST|Build|BUILD|Deploy|DEPLOY)\s+\d+/im;

// ─── GUARD CLASS ─────────────────────────────────────────────

export class HallucinationGuard {
  private toolCalls: ToolCallRecord[] = [];
  private turnStartTime = 0;

  /**
   * Start a new turn. Resets tool call tracking.
   */
  startTurn(): void {
    this.toolCalls = [];
    this.turnStartTime = Date.now();
  }

  /**
   * Record a tool call that was actually executed.
   */
  recordToolCall(name: string, args: Record<string, unknown>, success: boolean): void {
    this.toolCalls.push({
      name,
      args,
      success,
      timestamp: Date.now(),
    });
  }

  /**
   * Get the list of tool names that were called this turn.
   */
  getCalledTools(): string[] {
    return [...new Set(this.toolCalls.map(tc => tc.name))];
  }

  /**
   * Get the count of tool calls this turn.
   */
  getToolCallCount(): number {
    return this.toolCalls.length;
  }

  /**
   * Audit the LLM response against actual tool calls.
   * Returns a GuardResult with violations and optionally modified text.
   */
  audit(responseText: string): GuardResult {
    const violations: Violation[] = [];
    const calledTools = this.getCalledTools();
    const lines = responseText.split("\n");

    for (const pattern of CLAIM_PATTERNS) {
      for (const regex of pattern.patterns) {
        for (const line of lines) {
          if (regex.test(line)) {
            // Check if any required tool was actually called
            const hasRequiredTool = pattern.requiredTools.some(t => calledTools.includes(t));

            if (!hasRequiredTool) {
              violations.push({
                type: pattern.type,
                claim: regex.source.slice(0, 60),
                line: line.trim().slice(0, 120),
                severity: pattern.severity,
              });
            }
          }
        }
      }
    }

    // Check for suspicious status lines
    if (STATUS_LINE_PATTERN.test(responseText) && this.toolCalls.length === 0) {
      violations.push({
        type: "generic_completion",
        claim: "Status-style completion lines with zero tool calls",
        line: responseText.match(STATUS_LINE_PATTERN)?.[0]?.trim().slice(0, 120) ?? "",
        severity: "critical",
      });
    }

    // Speed check: if response claims multiple file operations but turn was < 2s
    // and no tool calls were made, that's suspicious
    const turnDurationMs = Date.now() - this.turnStartTime;
    const fileClaimCount = violations.filter(v =>
      v.type === "file_write_claim" || v.type === "file_edit_claim"
    ).length;
    if (fileClaimCount >= 2 && turnDurationMs < 3000 && this.toolCalls.length === 0) {
      violations.push({
        type: "generic_completion",
        claim: `${fileClaimCount} file operation claims in ${turnDurationMs}ms with 0 tool calls`,
        line: "(speed heuristic)",
        severity: "critical",
      });
    }

    // Deduplicate by type + line
    const seen = new Set<string>();
    const uniqueViolations = violations.filter(v => {
      const key = `${v.type}:${v.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const criticalCount = uniqueViolations.filter(v => v.severity === "critical").length;
    const warningCount = uniqueViolations.filter(v => v.severity === "warning").length;

    if (uniqueViolations.length === 0) {
      return {
        detected: false,
        text: responseText,
        violations: [],
        summary: `clean (${this.toolCalls.length} tool calls)`,
      };
    }

    // Build modified response
    const warningBlock = this.buildWarningBlock(uniqueViolations, calledTools);
    const modifiedText = criticalCount > 0
      ? `${warningBlock}\n\n---\n\n${responseText}`
      : `${responseText}\n\n---\n${warningBlock}`;

    return {
      detected: true,
      text: modifiedText,
      violations: uniqueViolations,
      summary: `HALLUCINATION: ${criticalCount} critical, ${warningCount} warning (${this.toolCalls.length} actual tool calls)`,
    };
  }

  /**
   * Build a user-visible warning block.
   */
  private buildWarningBlock(violations: Violation[], calledTools: string[]): string {
    const criticals = violations.filter(v => v.severity === "critical");
    const warnings = violations.filter(v => v.severity === "warning");

    const parts: string[] = [];

    if (criticals.length > 0) {
      parts.push("⚠️ **DOĞRULAMA UYARISI**");
      parts.push("");
      parts.push("Bu yanıtta aşağıdaki iddialar tool çağrısı olmadan yapılmış:");
      for (const v of criticals) {
        const typeLabel = VIOLATION_LABELS[v.type] ?? v.type;
        parts.push(`• ❌ ${typeLabel}: \`${v.line.slice(0, 80)}\``);
      }
      parts.push("");
      parts.push(`Gerçek tool çağrıları: ${calledTools.length > 0 ? calledTools.join(", ") : "HİÇBİRİ"}`);
      parts.push("");
      parts.push("⚠️ **Yukarıdaki iddialar doğrulanmamıştır. Lütfen manuel kontrol edin.**");
    }

    if (warnings.length > 0 && criticals.length === 0) {
      parts.push(`ℹ️ Not: ${warnings.length} doğrulanmamış iddia tespit edildi.`);
    }

    return parts.join("\n");
  }
}

// ─── LABELS ──────────────────────────────────────────────────

const VIOLATION_LABELS: Record<ViolationType, string> = {
  file_write_claim: "Dosya yazma iddiası",
  file_edit_claim: "Dosya düzenleme iddiası",
  commit_claim: "Git commit iddiası",
  push_claim: "Git push iddiası",
  test_claim: "Test sonucu iddiası",
  build_claim: "Build sonucu iddiası",
  delete_claim: "Silme iddiası",
  install_claim: "Yükleme iddiası",
  deploy_claim: "Deploy iddiası",
  generic_completion: "Tamamlanma iddiası",
};

// ─── CONVENIENCE ─────────────────────────────────────────────

/**
 * Quick one-shot audit: pass tool calls + response text, get result.
 */
export function auditResponse(
  responseText: string,
  toolCalls: Array<{ name: string; args?: Record<string, unknown>; success?: boolean }>,
): GuardResult {
  const guard = new HallucinationGuard();
  guard.startTurn();
  for (const tc of toolCalls) {
    guard.recordToolCall(tc.name, tc.args ?? {}, tc.success ?? true);
  }
  return guard.audit(responseText);
}
