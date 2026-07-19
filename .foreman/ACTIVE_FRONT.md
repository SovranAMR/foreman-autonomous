# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A06
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 434/1000
phase_progress: 30/100
block_progress: 5/10
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

P05-B04-A06 — Shell ve process lifecycle: evidence, telemetry ve provenance kaydını ekle.

objective: P05-B04-A05 failure/recovery slice sealed; extend evidence/telemetry/provenance for failure/recovery run records.
target: Worker shell process failure/recovery slice with auditable evidence, telemetry and provenance wired to contract probes.
hypothesis: Evidence slice closes remaining shell process telemetry gaps without regressing A05 failure/recovery alignment.
acceptance: Evidence/telemetry/provenance probes wired; run record validators exported; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts, src/orchestrator.ts, src/tools.ts
rollback: P05-B04-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A05
last_commit: 332fd84
tests: PASS — forge-p05-worker-shell-process-failure-recovery.test.ts (5/5), forge-p05-worker-shell-process-boundary.test.ts (6/6), forge-p05-worker-shell-process-production.test.ts (5/5), forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: validateWorkerShellProcessFailureRecoveryProbeMatrix + runWorkerShellProcessFailureRecoverySlice + validateShellCommand + buildShellProcessTelemetry; 7/7 failure/recovery/NO-GO probes aligned, 27/27 total probes aligned
next: P05-B04-A06
