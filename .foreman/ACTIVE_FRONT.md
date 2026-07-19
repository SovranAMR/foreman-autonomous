# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 197/1000
phase_progress: 96/100
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

P02-B10-A09 — Vizyoner phase gate: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B10-A08 PASS; add guard controls (adversarial/perf/cost/safety) to visioner phase gate regression slice.
target: validateForgeVisionerPhaseGateGuard, orchestrator verifyForgeP02VisionerPhaseGateGuard.
hypothesis: guard rejects tampered records, enforces perf/cost budgets, and blocks unsafe detail patterns.
acceptance: guard PASS; adversarial scenarios rejected; regression gate includes guard metrics.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.guard.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/orchestrator.ts
rollback: P02-B10-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Guard cannot align with canonical matrix after A08 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A08
last_commit: pending
tests: PASS — forge-p02-visioner-phase-gate.test.ts (26/26); forge-pipeline-regression.integration.test.ts P02-B10-A08 (5/5); 126/126 total
evidence: runForgeVisionerPhaseGateRegressionGate; detectVisionerPhaseGateProbeRegression; verifyForgeP02VisionerPhaseGateRegression; 24/24 probes aligned; prior/current comparison no false regression; handoff=P02-B10-A08→A09
next: P02-B10-A09
