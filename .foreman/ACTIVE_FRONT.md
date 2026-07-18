# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 12/1000
phase_progress: 12/100
block_progress: 2/10
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

P01-B02-A03 — Mevcut pipeline davranış haritası: en küçük üretim dikey dilimini uygula.

objective: Pipeline behavior map için en küçük üretim dikey dilimini uygula.
target: İlk contract gap veya seam düzeltmesi + harness doğrulama.
hypothesis: B02-A02 contract sealed; A03 ilk üretim slice.
acceptance: En az bir gap için üretim kodu veya harness iyileştirmesi, hedefli test PASS.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: orchestrator.ts, forge-pipeline-behavior-map*.ts
rollback: A03 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A02
last_commit: 82b77a4
tests: PASS — forge-pipeline-behavior-map (7/7), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1 category acceptance (5 categories, 16 probes, 2 gap disposition), fixture↔contract aligned, runPipelineBehaviorMapProbes 16/16
next: P01-B02-A03
