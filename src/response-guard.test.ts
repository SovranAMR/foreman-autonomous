/**
 * FOREMAN — Hallucination Guard Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ResponseGuard, auditResponse } from "./response-guard.js";

describe("ResponseGuard", () => {
  let guard: ResponseGuard;

  beforeEach(() => {
    guard = new ResponseGuard();
    guard.startTurn();
  });

  describe("clean responses", () => {
    it("passes when no claims are made", () => {
      const result = guard.audit("Merhaba, nasılsın?");
      expect(result.detected).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it("passes when claims have matching tool calls", () => {
      guard.recordToolCall("write_file", { path: "src/foo.ts" }, true);
      const result = guard.audit("✅ Dosya yazıldı: src/foo.ts");
      expect(result.detected).toBe(false);
    });

    it("passes when bash was called for git operations", () => {
      guard.recordToolCall("bash", { command: "git commit -m 'test'" }, true);
      const result = guard.audit("✅ COMMIT YAPILDI: abc1234");
      expect(result.detected).toBe(false);
    });

    it("passes when bash was called for tests", () => {
      guard.recordToolCall("bash", { command: "npm test" }, true);
      const result = guard.audit("✅ 15/15 test geçti");
      expect(result.detected).toBe(false);
    });
  });

  describe("file write hallucinations", () => {
    it("detects file write claim without tool call", () => {
      const result = guard.audit("✅ Dosya 1/6: Event Bus Core - YAZILDI (423 satır)");
      expect(result.detected).toBe(true);
      expect(result.violations.some(v => v.type === "file_write_claim")).toBe(true);
    });

    it("detects Turkish file creation claim", () => {
      const result = guard.audit("Dosyayı yazdım ve kaydettim.");
      expect(result.detected).toBe(true);
    });

    it("detects multiple file claims", () => {
      const text = [
        "✅ Dosya 1/6: event-bus.ts - YAZILDI (423 satır)",
        "✅ Dosya 2/6: handoff.ts - YAZILDI (298 satır)",
        "✅ Dosya 3/6: messaging.ts - YAZILDI (445 satır)",
      ].join("\n");
      const result = guard.audit(text);
      expect(result.detected).toBe(true);
      expect(result.violations.filter(v => v.severity === "critical").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("commit/push hallucinations", () => {
    it("detects commit claim without tool call", () => {
      const result = guard.audit("✅ COMMIT YAPILDI: b8f2c1a — feat(agent-mesh): Faz 2");
      expect(result.detected).toBe(true);
      expect(result.violations.some(v => v.type === "commit_claim")).toBe(true);
    });

    it("detects push claim without tool call", () => {
      const result = guard.audit("✅ PUSH TAMAMLANDI!\nhttps://github.com/SovranAMR/foreman/commit/b8f2c1a");
      expect(result.detected).toBe(true);
      expect(result.violations.some(v => v.type === "push_claim")).toBe(true);
    });

    it("detects fake commit hash", () => {
      const result = guard.audit("Commit: b8f2c1a — feat: something cool");
      expect(result.detected).toBe(true);
    });
  });

  describe("test hallucinations", () => {
    it("detects test pass claim without bash call", () => {
      const result = guard.audit("✅ Test Sonucu: 15/15 test geçti");
      expect(result.detected).toBe(true);
      expect(result.violations.some(v => v.type === "test_claim")).toBe(true);
    });
  });

  describe("generic completion hallucinations", () => {
    it("detects line count claims", () => {
      const result = guard.audit("Toplam: 2,385 satır yeni kod");
      expect(result.detected).toBe(true);
    });

    it("detects 'eklenen dosyalar' without tool calls", () => {
      const result = guard.audit("Eklenen Dosyalar:\n- src/event-bus.ts\n- src/handoff.ts");
      expect(result.detected).toBe(true);
    });
  });

  describe("warning block", () => {
    it("prepends warning for critical violations", () => {
      const result = guard.audit("✅ COMMIT YAPILDI: abc1234\n✅ PUSH TAMAMLANDI!");
      expect(result.detected).toBe(true);
      expect(result.text).toContain("⚠️ **DOĞRULAMA UYARISI**");
      expect(result.text).toContain("HİÇBİRİ");
    });

    it("shows actual tools called", () => {
      guard.recordToolCall("read_file", { path: "src/foo.ts" }, true);
      const result = guard.audit("✅ Dosya yazıldı: src/foo.ts");
      expect(result.detected).toBe(true);
      expect(result.text).toContain("read_file");
    });
  });

  describe("auditResponse convenience function", () => {
    it("works with no tool calls", () => {
      const result = auditResponse("✅ COMMIT YAPILDI: abc1234", []);
      expect(result.detected).toBe(true);
    });

    it("works with matching tool calls", () => {
      const result = auditResponse("✅ COMMIT YAPILDI: abc1234", [
        { name: "bash", args: { command: "git commit" }, success: true },
      ]);
      expect(result.detected).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("does not flag discussion about commits", () => {
      // "Let's make a commit" is not a claim of having committed
      const result = guard.audit("Şimdi commit yapalım mı?");
      expect(result.detected).toBe(false);
    });

    it("does not flag read-only tool usage descriptions", () => {
      guard.recordToolCall("read_file", { path: "src/foo.ts" }, true);
      const result = guard.audit("Dosyayı okudum, içeriği şöyle:");
      expect(result.detected).toBe(false);
    });
  });
});
