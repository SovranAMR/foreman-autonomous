# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A10
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 428/1000
phase_progress: 24/100
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

P05-B03-A10 — Cerrahi edit engine: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P05-B03-A09 guard slice sealed; seal block gate with full probe matrix and B04 handoff.
target: Close P05-B03 block gate with sealed evidence, regression suite and P05-B04 entry contract.
hypothesis: Block gate seals all 10 atoms with zero mismatches and exports handoff to shell/process lifecycle.
acceptance: Block gate probe matrix aligned; block suite green; handoff contract exported.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A09
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine.guard.test.ts (9/9), integration (7/7), property-fuzz (7/7), evidence (5/5), failure-recovery (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 61 total
evidence: runWorkerEditEngineGuardSlice + validateForgeWorkerEditEngineGuard; adversarial 3/3 rejected, perf/cost/safety ceilings pass, guard gate aligned with regression gate
next: P05-B03-A10
