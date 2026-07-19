# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 186/1000
phase_progress: 85/100
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

P02-B09-A08 — Kullanıcı approval ve steering: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B09-A07 PASS; wire approval slice into Forge regression integration with detectVisionerApprovalProbeRegression gate.
target: forge-p02-visioner-approval Forge integration regression slice.
hypothesis: integrated regression detects approval probe alignment regressions while accepting valid baseline runs.
acceptance: forge-p02-visioner-approval regression integration gates pass.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-approval*, src/forge-pipeline-regression*
rollback: P02-B09-A08 Forge integration slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Forge integration cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A07
last_commit: pending
tests: PASS — forge-p02-visioner-approval.property-fuzz.test.ts (5/5), forge-p02-visioner-approval.test.ts (26/26), forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: runVisionerApprovalPropertyChecks; runVisionerApprovalFuzzValidation; runVisionerApprovalRunRecordFuzzValidation; property=8/8 fuzz=24/24 rejected runRecord mutations=0 accepted
next: P02-B09-A08
