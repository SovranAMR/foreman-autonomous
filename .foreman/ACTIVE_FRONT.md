# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 182/1000
phase_progress: 81/100
block_progress: 3/10
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

P02-B09-A04 — Kullanıcı approval ve steering: boundary ve edge-case davranışlarını tamamla.

objective: P02-B09-A03 PASS; complete boundary category edge-case behavior for visioner approval input.
target: forge-p02-visioner-approval boundary slice with assessVisionerApprovalInputBoundary edge probes aligned PASS.
hypothesis: boundary category probes cover empty, whitespace, null-byte and max-length vision approval inputs with zero mismatches.
acceptance: forge-p02-visioner-approval.test.ts boundary slice gates pass; boundary probes fully aligned.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary probes cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A03
last_commit: pending
tests: PASS — forge-p02-visioner-approval.test.ts (12/12), forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: recoverVisionerSteering export; vapp.structured_steering_recovery PASS; matrix passAligned=23 gapAligned=0 unexpectedMismatches=0; runVisionerApprovalProductionSlice valid
next: P02-B09-A04
