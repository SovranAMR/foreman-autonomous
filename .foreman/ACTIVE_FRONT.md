# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 187/1000
phase_progress: 86/100
block_progress: 8/10
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

P02-B09-A09 — Kullanıcı approval ve steering: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B09-A08 PASS; wire guard integration tests and orchestrator verification for approval slice.
target: forge-p02-visioner-approval guard controls integration.
hypothesis: validateForgeVisionerApprovalGuard rejects tampered records and passes canonical baseline.
acceptance: guard integration gates pass with adversarial=3/3.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-approval*, src/forge-pipeline-regression*, src/orchestrator.ts
rollback: P02-B09-A09 guard integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Guard integration cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A08
last_commit: pending
tests: PASS — forge-p02-visioner-approval.test.ts (26/26), forge-pipeline-regression.integration.test.ts (+5 P02-B09-A08)
evidence: runForgeVisionerApprovalRegressionGate; detectVisionerApprovalProbeRegression; runVisionerApprovalRegressionIntegration; verifyForgeVisionerApprovalRegression; 23/23 probes adversarial=3/3
next: P02-B09-A09
