# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 107/1000
phase_progress: 7/100
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

P02-B01-A08 — Intent ve görev anlamlandırma: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B01-A07 property/fuzz slice sealed; Forge regression integration slice A08 next.
target: visioner intent probe regression gate wired into forge-pipeline-regression integration suite.
hypothesis: regression integration closes A08 without scope creep beyond documented gaps.
acceptance: forge-pipeline-regression integration passes visioner intent slice; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts; npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-pipeline-regression.integration.test.ts, src/forge-p02-visioner-intent*.ts
rollback: P02-B01-A08 regression integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: regression cannot validate without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A07
last_commit: ff93be8
tests: PASS — forge-p02-visioner-intent.test.ts (24/24); forge-p02-visioner-intent.property-fuzz.test.ts (5/5); property 8/8; fixture fuzz all rejected; run record fuzz all rejected; harnessVersion=1.0.0-b07
evidence: runVisionerIntentPropertyChecks, runVisionerIntentFuzzValidation, runVisionerIntentRunRecordFuzzValidation; structured_intent_recovery gap preserved in evidence
next: P02-B01-A08
