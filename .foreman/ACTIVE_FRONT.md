# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 319/1000
phase_progress: 19/100
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

P04-B02-A10 — Repo içi kanıt toplama: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B02-A09 PASS; seal in-repo evidence block gate and emit B03 handoff.
target: block gate runner, orchestrator block gate hook, B03 handoff contract.
hypothesis: Block gate passes on canonical matrix + guard + regression; handoff exposes B03 entry atom.
acceptance: block gate PASS; orchestrator block gate verification emits event; B03 handoff sealed.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-in-repo-evidence*.ts
rollback: P04-B02-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A09
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (106/106); guard adversarial=3/3; perf/cost/safety PASS; orchestrator guard verification PASS
evidence: validateForgeResearcherInRepoEvidenceGuard; runResearcherInRepoEvidenceAdversarialGuardChecks; verifyForgeResearcherInRepoEvidenceGuard; forge-p04-researcher-in-repo-evidence.guard.test.ts
next: P04-B02-A10
