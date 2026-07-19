# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 181/1000
phase_progress: 80/100
block_progress: 2/10
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

P02-B09-A03 — Kullanıcı approval ve steering: en küçük üretim dikey dilimini uygula.

objective: P02-B09-A02 contract PASS; implement recoverVisionerSteering production slice closing vapp.structured_steering_recovery gap.
target: forge-p02-visioner-approval production slice with recoverVisionerSteering export and probe alignment.
hypothesis: recoverVisionerSteering restructures malformed steering parse into actionable approval revision, closing documented FAIL gap.
acceptance: forge-p02-visioner-approval.test.ts production slice gates pass; vapp.structured_steering_recovery aligned PASS.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: recoverVisionerSteering cannot close gap ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A02
last_commit: fbc59bd
tests: PASS — forge-p02-visioner-approval.test.ts (9/9)
evidence: validateVisionerApprovalContractCoverage valid; 23 probes (22 PASS + 1 documented FAIL gap vapp.structured_steering_recovery); matrix passAligned=22 gapAligned=1 unexpectedMismatches=0
next: P02-B09-A03
