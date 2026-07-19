# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 126/1000
phase_progress: 26/100
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

P02-B03-A08 — Ürün vizyonu sentezi: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B03-A07 property/fuzz slice sealed; B03 regression integration slice next.
target: Wire visioner synthesis property/fuzz gates into Forge regression integration harness.
hypothesis: A07 run record fuzz anchor enables stable regression detection without scope creep.
acceptance: regression slice validates synthesis probe matrix with zero unexpected rejections.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts, src/forge-p02-visioner-synthesis.probe.ts
rollback: P02-B03-A08 regression integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A07
last_commit: bd5cf3c
tests: PASS — forge-p02-visioner-synthesis.property-fuzz.test.ts (5/5); forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (21/21); forge-p02-visioner-synthesis*.test.ts (29/29); forge-p02-*.test.ts (115/115)
evidence: runVisionerSynthesisPropertyChecks allPassed=true total=8; runVisionerSynthesisFuzzValidation seeds=[42,99,20260719] rejected=24/24; runVisionerSynthesisRunRecordFuzzValidation failureRecovery mutationsRejected=5 mutationsAccepted=0 fullRun mutationsRejected=3; harnessVersion=1.0.0-a07
next: P02-B03-A08
