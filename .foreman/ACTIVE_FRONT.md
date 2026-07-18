# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 17/1000
phase_progress: 17/100
block_progress: 7/10
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

P01-B02-A08 — Mevcut pipeline davranış haritası: Forge entegrasyonu ile regression testini tamamla.

objective: Pipeline behavior map Forge entegrasyonu ile regression testini tamamla.
target: Behavior map regression gate ve orchestrator verification entegrasyonu.
hypothesis: B02-A07 property/fuzz slice sealed; A08 regression integration slice.
acceptance: Regression gate PASS, orchestrator verification event.
commands: npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: forge-pipeline-behavior-map*.ts, orchestrator.ts
rollback: A08 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A07
last_commit: 1eadedc
tests: PASS — forge-pipeline-behavior-map (17/17), forge-pipeline-behavior-map.property-fuzz (4/4), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: runBehaviorMapPropertyChecks (7 structural properties), runBehaviorMapFuzzValidation (72/72 mutations rejected), runBehaviorMapRunRecordFuzzValidation (3/3 corrupted records rejected); contract atom P01-B02-A07
next: P01-B02-A08
