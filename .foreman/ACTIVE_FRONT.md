# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 318/1000
phase_progress: 18/100
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

P04-B02-A09 — Repo içi kanıt toplama: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B02-A08 PASS; add adversarial/perf/cost/safety guard controls for in-repo evidence collection.
target: guard validation, adversarial scenarios, orchestrator guard hook.
hypothesis: Guard rejects tampered records, false alignment and budget violations on canonical matrix.
acceptance: guard checks PASS; adversarial scenarios rejected; orchestrator guard verification emits event.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-in-repo-evidence*.ts
rollback: P04-B02-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A08
last_commit: 1a27ce5
tests: PASS — forge-p04-researcher*.test.ts (98/98); regression gate 23/23 aligned; adversarial=3/3; propertyFuzz rejected=24/24; runFuzz rejected=5
evidence: runForgeResearcherInRepoEvidenceRegressionGate; detectResearcherInRepoEvidenceProbeRegression; validateForgeResearcherInRepoEvidenceGuard; verifyForgeResearcherInRepoEvidenceRegression
next: P04-B02-A09
