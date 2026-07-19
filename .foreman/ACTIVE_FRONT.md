# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A10
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 408/1000
phase_progress: 6/100
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

P05-B01-A10 — Typed tool interface ve dispatch: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P05-B01-A09 guard slice sealed; wire block gate evidence and P05-B02 handoff contract.
target: Seal P05-B01 block gate with atom seals, guard/regression evidence and next-block handoff.
hypothesis: validateForgeWorkerToolDispatchBlockGate rejects incomplete seals and exports P05-B02 entry contract.
acceptance: Block gate PASS with all 10 atom seals, guard/regression evidence and handoff contract valid.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch.ts
rollback: P05-B01-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A09
last_commit: ab8f45f
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5), forge-p05-worker-tool-dispatch-boundary.test.ts (4/4), forge-p05-worker-tool-dispatch-failure-recovery.test.ts (5/5), forge-p05-worker-tool-dispatch-evidence.test.ts (5/5), forge-p05-worker-tool-dispatch-property-fuzz.test.ts (6/6), forge-p05-worker-tool-dispatch-integration.test.ts (7/7), forge-p05-worker-tool-dispatch.guard.test.ts (9/9)
evidence: validateForgeWorkerToolDispatchGuard + runWorkerToolDispatchGuardSlice; adversarial 3/3 rejected, perf/cost/safety within ceilings, guard wired into integration slice
next: P05-B01-A10
