# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 188/1000
phase_progress: 87/100
block_progress: 9/10
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

P02-B09-A10 — Kullanıcı approval ve steering: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B09-A09 PASS; seal P02-B09 block gate with full atom inventory and B10 handoff.
target: forge-p02-visioner-approval block gate seal and orchestrator verification.
hypothesis: runForgeVisionerApprovalBlockGate seals all 10 atoms with guard+regression evidence.
acceptance: block gate passes with atomSeals=10/10 and handoff=PASS→P02-B10.
commands: npx tsx --test src/forge-p02-visioner-approval-block-gate.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-approval*, src/forge-pipeline-regression*, src/orchestrator.ts
rollback: P02-B09-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Block gate cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A09
last_commit: pending
tests: PASS — forge-p02-visioner-approval.guard.test.ts (8/8), forge-p02-visioner-approval.test.ts (26/26), forge-pipeline-regression.integration.test.ts (+2 P02-B09-A09, 127 total in run)
evidence: validateForgeVisionerApprovalGuard; runVisionerApprovalAdversarialGuardChecks; verifyForgeVisionerApprovalGuard; guard integration adversarial=3/3
next: P02-B09-A10
