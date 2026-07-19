# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A10
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 438/1000
phase_progress: 34/100
block_progress: 9/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-19

## Tek seferlik bootstrap — program atomu değildir

İlk automation koşusunda src/kimi-provider.ts veya MessagingGateway hâlâ ana model
olarak kimi-k2.6 kullanıyorsa Kimi K3'e tek bounded değişiklikle geçir:

- ana model kimi-k3;
- resmi K3 request parametreleri;
- K2.x thinking alanını K3'e gönderme;
- provider-aware model seçimi;
- odaklı test.

Bu bootstrap için phase/block üretme. Kanıtlı PASS sonrası doğrudan P01-B01-A01'e dön.
Zaten tamamlanmışsa tekrar yapma.

## Aktif atom

P05-B04-A10 — Shell ve process lifecycle: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P05-B04-A09 guard slice sealed; seal block gate evidence and hand off to P05-B05.
target: Worker shell process block gate with sealed probe harness and regression gate evidence.
hypothesis: Block gate closes P05-B04 with canonical run record and probe matrix alignment.
acceptance: Block gate PASS; sealed evidence exported; handoff baseline ready; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts, src/forge-p05-worker-shell-process.probe.ts
rollback: P05-B04-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A09
last_commit: pending
tests: PASS — forge-p05-worker-shell-process.guard.test.ts (9/9), forge-p05-worker-shell-process-integration.test.ts (7/7), forge-p05-worker-shell-process-property-fuzz.test.ts (7/7), forge-p05-worker-shell-process-evidence.test.ts (5/5), forge-p05-worker-shell-process-failure-recovery.test.ts (5/5), forge-p05-worker-shell-process-boundary.test.ts (6/6), forge-p05-worker-shell-process-production.test.ts (5/5), forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: validateForgeWorkerShellProcessGuard + runWorkerShellProcessGuardSlice + runForgeWorkerShellProcessGuardGate + detectWorkerShellProcessFalseAlignment + detectWorkerShellProcessEvidenceSummaryMismatch; adversarial 3/3 rejected, perf/cost/safety PASS, guard gate PASS
next: P05-B04-A10
