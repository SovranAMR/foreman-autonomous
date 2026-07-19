# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 137/1000
phase_progress: 37/100
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

P02-B04-A09 — Repo ve kullanıcı bağlamı grounding: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B04-A08 regression gate sealed; guard controls next.
target: Wire visioner grounding guard gate (adversarial/perf/cost/safety) and orchestrator verification event.
hypothesis: A08 regression substrate plus guard controls provide stable block gate foundation for A09.
acceptance: guard gate passes; adversarial scenarios rejected; perf/cost/safety within bounds; orchestrator emits verification.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard integration requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A08
last_commit: pending
tests: PASS — forge-p02-visioner-grounding.test.ts (21/21); forge-p02-visioner-grounding-baseline.test.ts (3/3); forge-p02-visioner-grounding.property-fuzz.test.ts (5/5); forge-pipeline-regression.integration.test.ts P02-B04-A08 (5/5)
evidence: runForgeVisionerGroundingRegressionGate; runVisionerGroundingRegressionIntegration; detectVisionerGroundingProbeRegression; validateForgeVisionerGroundingGuard; 23/23 probes aligned; propertyFuzz 8/8 properties + 72/72 contractFuzz + 3/3 runFuzz; orchestrator visioner_grounding_regression verification
next: P02-B04-A09
