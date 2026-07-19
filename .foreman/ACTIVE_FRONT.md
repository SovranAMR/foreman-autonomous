# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 108/1000
phase_progress: 8/100
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

P02-B01-A09 — Intent ve görev anlamlandırma: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B01-A08 regression integration slice sealed; guard/adversarial slice A09 next.
target: visioner intent guard gate wired into orchestrator and regression suite with adversarial rejection proofs.
hypothesis: validateForgeVisionerIntentGuard from A08 foundation closes A09 without scope creep beyond documented gaps.
acceptance: guard gate passes on canonical matrix; orchestrator verifyForgeVisionerIntentGuard emits verification; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts; npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-intent.ts, src/forge-p02-visioner-intent.probe.ts, src/orchestrator.ts
rollback: P02-B01-A09 guard integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard cannot validate without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A08
last_commit: pending
tests: PASS — forge-p02-visioner-intent*.test.ts (29/29); forge-pipeline-regression.integration.test.ts P02-B01-A08 (5/5); regression gate 23/23 aligned
evidence: runForgeVisionerIntentRegressionGate, detectVisionerIntentProbeRegression, verifyForgeVisionerIntentRegression; structured_intent_recovery gap preserved
next: P02-B01-A09
