# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 309/1000
phase_progress: 9/100
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

P04-B01-A10 — Research question decomposition: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B01-A09 PASS; seal block gate evidence and handoff to P04-B02.
target: Block gate evidence, atom seals, regression+guard PASS, P04-B02 entry handoff contract.
hypothesis: A09 guard stabilizes adversarial/perf/cost/safety; A10 can seal block without reopening guard.
acceptance: block gate PASS; handoff valid; seals cover A01–A09; next block entry atom wired.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A09
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (50/50); guard PASS; adversarial=3/3 rejected; perf/cost/safety within budgets
evidence: validateForgeResearcherQuestionDecompositionGuard; runResearcherQuestionDecompositionAdversarialGuardChecks; verifyForgeResearcherQuestionDecompositionGuard; harnessVersion=1.0.0-a09
next: P04-B01-A10
