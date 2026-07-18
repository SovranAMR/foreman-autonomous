# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 13/1000
phase_progress: 13/100
block_progress: 3/10
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

P01-B02-A04 — Mevcut pipeline davranış haritası: boundary ve edge-case davranışlarını tamamla.

objective: Pipeline behavior map boundary ve edge-case davranışlarını tamamla.
target: Atomize state sync gap veya diğer boundary probe'ları için üretim/harness iyileştirmesi.
hypothesis: B02-A03 registry_export sealed; A04 boundary/edge tamamlama.
acceptance: Boundary probe coverage genişletilmiş, hedefli test PASS.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: orchestrator.ts, types.ts, forge-pipeline-behavior-map*.ts
rollback: A04 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A03
last_commit: pending
tests: PASS — forge-pipeline-behavior-map (8/8), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: FORGE_PIPELINE_PHASES exported from orchestrator.ts; map.registry_export gap closed (15 PASS / 1 FAIL gap atomize_state_sync), runPipelineBehaviorMapProbes 16/16 aligned
next: P01-B02-A04
