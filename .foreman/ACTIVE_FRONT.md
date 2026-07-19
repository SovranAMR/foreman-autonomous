# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A09
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 427/1000
phase_progress: 23/100
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

P05-B03-A09 — Cerrahi edit engine: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P05-B03-A08 integration slice sealed; wire guard controls for adversarial/perf/cost/safety.
target: Close guard slice with tamper rejection, performance ceilings and safety pattern checks.
hypothesis: Edit engine guard slice rejects tampered records and passes canonical matrix under ceilings.
acceptance: Guard probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A08
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine-integration.test.ts (7/7), property-fuzz (7/7), evidence (5/5), failure-recovery (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 52 total
evidence: runWorkerEditEngineIntegrationSlice + validateWorkerEditEngineIntegrationProbeMatrix; 6/6 sub-slices aligned, prior/current run record comparison, guard checks pass
next: P05-B03-A09
