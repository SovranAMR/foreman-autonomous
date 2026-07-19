# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 359/1000
phase_progress: 59/100
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

P04-B06-A10 — Contradiction ve freshness çözümü: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B06-A09 PASS; guard exports; regression slice remains green; guard suite green; orchestrator guard wired.
target: Seal P04-B06 block gate with contradiction freshness handoff to P04-B07.
hypothesis: Block gate evidence seals all ten atoms with valid B07 handoff contract.
acceptance: Block gate sealed; handoff contract valid; block gate test green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts src/forge-p04-researcher-contradiction-freshness-block-gate.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A09
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (53/53); guard adversarial=3/3; performance/cost/safety guard green; orchestrator verifyForgeResearcherContradictionFreshnessGuard wired
evidence: validateForgeResearcherContradictionFreshnessGuard + runResearcherContradictionFreshnessAdversarialGuardChecks + forge-p04-researcher-contradiction-freshness.guard.test.ts; orchestrator researcher_contradiction_freshness_guard verification
next: P04-B06-A10
