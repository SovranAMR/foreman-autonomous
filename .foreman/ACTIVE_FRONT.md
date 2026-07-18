# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 18/1000
phase_progress: 18/100
block_progress: 8/10
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

P01-B02-A09 — Mevcut pipeline davranış haritası: adversarial, performance, cost ve safety kontrolünü geçir.

objective: Pipeline behavior map adversarial/perf/cost/safety guard kontrolünü tamamla.
target: Behavior map guard gate ve orchestrator verification entegrasyonu.
hypothesis: B02-A08 regression slice sealed; A09 guard integration slice.
acceptance: Guard gate PASS, orchestrator verification event.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: forge-pipeline-behavior-map*.ts, orchestrator.ts
rollback: A09 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A08
last_commit: bfe5f9e
tests: PASS — forge-pipeline-behavior-map (17/17), forge-pipeline-behavior-map.property-fuzz (4/4), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (8/8)
evidence: runForgeBehaviorMapRegressionGate (26/26 probes aligned), detectBehaviorMapProbeRegression (regression detection), orchestrator verifyForgeBehaviorMapRegression emits behavior_map_regression verification event; contract atom P01-B02-A08
next: P01-B02-A09
