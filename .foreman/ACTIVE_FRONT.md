# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 118/1000
phase_progress: 18/100
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

P02-B02-A10 — Constraint ve non-goal çıkarımı: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B02-A09 guard slice sealed; B02 block gate A10 next.
target: Seal P02-B02 block gate with regression, guard, and B03 handoff contract.
hypothesis: typed A09 guard gate provides stable anchor for block gate sealing.
acceptance: block gate passes; all A01–A09 deliverables validated; B03 handoff contract valid.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.probe.ts
rollback: P02-B02-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A09
last_commit: 15a3a22
tests: PASS — forge-p02-visioner-constraint*.test.ts (42/42); forge-p02-visioner-intent*.test.ts (43/43); forge-p02-*.test.ts (85/85); forge-pipeline-regression.integration.test.ts (126/126)
evidence: validateForgeVisionerConstraintGuard (adversarial=3/3 rejected); runVisionerConstraintAdversarialGuardChecks; detectVisionerConstraintFalseAlignment; detectVisionerConstraintEvidenceSummaryMismatch; runForgeVisionerConstraintRegressionGate guard PASS; orchestrator verifyForgeVisionerConstraintGuard phase=visioner_constraint_guard
next: P02-B02-A10
