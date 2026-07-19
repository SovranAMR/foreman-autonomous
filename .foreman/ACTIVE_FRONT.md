# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 117/1000
phase_progress: 17/100
block_progress: 7/10
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

P02-B02-A09 — Constraint ve non-goal çıkarımı: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B02-A08 regression slice sealed; B02 guard slice A09 next.
target: Forge guard gate for visioner constraint probe matrix with adversarial/perf/cost/safety controls.
hypothesis: typed A08 regression gate provides stable anchor for guard validation.
acceptance: guard gate passes; adversarial scenarios rejected; perf/cost/safety within bounds.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A08
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint*.test.ts (34/34); forge-p02-visioner-intent*.test.ts (43/43); forge-p02-*.test.ts (77/77); forge-pipeline-regression.integration.test.ts (126/126)
evidence: runForgeVisionerConstraintRegressionGate (23/23 aligned); detectVisionerConstraintProbeRegression; propertyFuzz properties=8/8 contractFuzz rejected=24/24 runFuzz rejected=3/3; orchestrator verifyForgeVisionerConstraintRegression phase=visioner_constraint_regression
next: P02-B02-A09
