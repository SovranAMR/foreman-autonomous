# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A09
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 407/1000
phase_progress: 6/100
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

P05-B01-A09 — Typed tool interface ve dispatch: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P05-B01-A08 integration slice sealed; wire guard controls for adversarial/performance/cost/safety gate.
target: Extend typed tool dispatch with guard controls and adversarial guard checks.
hypothesis: validateForgeWorkerToolDispatchGuard rejects tampered records and enforces budget/perf ceilings.
acceptance: Guard check PASS with adversarial scenarios rejected and performance/cost/safety within ceilings.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch.ts
rollback: P05-B01-A09 guard control değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A08
last_commit: 06c077c
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5), forge-p05-worker-tool-dispatch-boundary.test.ts (4/4), forge-p05-worker-tool-dispatch-failure-recovery.test.ts (5/5), forge-p05-worker-tool-dispatch-evidence.test.ts (5/5), forge-p05-worker-tool-dispatch-property-fuzz.test.ts (6/6), forge-p05-worker-tool-dispatch-integration.test.ts (7/7)
evidence: validateWorkerToolDispatchIntegrationProbeMatrix + runWorkerToolDispatchIntegrationSlice; 6/6 sub-slices aligned, 27/27 probes aligned, zero unexpected mismatches, probe regression detection wired
next: P05-B01-A09
