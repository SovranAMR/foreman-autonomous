# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 19/1000
phase_progress: 19/100
block_progress: 9/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B02-A10 — Mevcut pipeline davranış haritası: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: Behavior map block gate evidence mühürle ve B03 handoff hazırla.
target: Block gate seal ve handoff contract.
hypothesis: B02-A09 guard sealed; A10 block gate slice.
acceptance: Block gate PASS, handoff contract valid.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: forge-pipeline-behavior-map*.ts, orchestrator.ts
rollback: A10 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A09
last_commit: ff263bb
tests: PASS — forge-pipeline-behavior-map (17/17), forge-pipeline-behavior-map.guard (8/8), forge-pipeline-behavior-map.property-fuzz (4/4), forge-pipeline-regression.integration (8/8), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3)
evidence: validateForgeBehaviorMapGuard (adversarial 3/3 rejected, perf/cost/safety PASS), runForgeBehaviorMapRegressionGate guard detail, orchestrator verifyForgeBehaviorMapGuard emits behavior_map_guard verification event; contract atom P01-B02-A09
next: P01-B02-A10
