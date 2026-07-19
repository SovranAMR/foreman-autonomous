# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 167/1000
phase_progress: 66/100
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

P02-B07-A09 — Alternative vision production slice: adversarial, performance, cost and safety controls.

objective: P02-B07-A08 regression gate PASS; guard controls next.
target: Add adversarial, performance, cost and safety guard validation for alternative vision evidence run record.
hypothesis: guard controls reject tampered records and enforce perf/cost/safety bounds.
acceptance: forge-p02-visioner-alternative guard slice PASS (A09 tests when added).
commands: npx tsx --test src/forge-p02-visioner-alternative.guard.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A08
last_commit: 566112d
tests: PASS — forge-pipeline-regression.integration.test.ts (84/84); forge-p02-visioner-alternative*.test.ts (32/32)
evidence: runForgeVisionerAlternativeRegressionGate (23/23 aligned); detectVisionerAlternativeProbeRegression flags misalignment; orchestrator verifyForgeVisionerAlternativeRegression emits visioner_alternative_regression
next: P02-B07-A09
