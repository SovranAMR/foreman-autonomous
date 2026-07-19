# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 180/1000
phase_progress: 79/100
block_progress: 1/10
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

P02-B09-A02 — Kullanıcı approval ve steering: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B09-A01 baseline PASS; define typed approval/steering contract with measurable acceptance criteria.
target: forge-p02-visioner-approval typed contract alignment and contract coverage validation.
hypothesis: Documented vapp.structured_steering_recovery FAIL gap maps to typed contract disposition and criterion.
acceptance: forge-p02-visioner-approval.test.ts contract coverage and alignment gates pass.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract cannot express baseline gaps ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A01
last_commit: pending
tests: PASS — forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: runVisionerApprovalProbes 22/23 aligned; documented FAIL gap vapp.structured_steering_recovery; fixture+probe harness sealed from P02-B08 handoff
next: P02-B09-A02
