# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A09
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 437/1000
phase_progress: 33/100
block_progress: 8/10
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

P05-B04-A09 — Shell ve process lifecycle: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P05-B04-A08 regression slice sealed; extend guard controls for shell process run records.
target: Worker shell process guard slice with adversarial/perf/cost/safety probes wired to contract.
hypothesis: Guard slice closes remaining shell process safety gaps without regressing A08 integration alignment.
acceptance: Guard detector exported; adversarial scenarios rejected; guard gate PASS; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts
rollback: P05-B04-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A08
last_commit: ccf67c9
tests: PASS — forge-p05-worker-shell-process-integration.test.ts (7/7), forge-p05-worker-shell-process-property-fuzz.test.ts (7/7), forge-p05-worker-shell-process-evidence.test.ts (5/5), forge-p05-worker-shell-process-failure-recovery.test.ts (5/5), forge-p05-worker-shell-process-boundary.test.ts (6/6), forge-p05-worker-shell-process-production.test.ts (5/5), forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: detectWorkerShellProcessProbeRegression + runWorkerShellProcessIntegrationSlice + validateWorkerShellProcessIntegrationProbeMatrix + runForgeWorkerShellProcessRegressionGate; 27/27 probes aligned, 6/6 sub-slices aligned, prior/current run record comparison PASS, guard integrated
next: P05-B04-A09
