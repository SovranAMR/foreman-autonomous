# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 399/1000
phase_progress: 95/100
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

P04-B10-A10 — Araştırmacı phase gate: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B10-A09 PASS; guard gate passes adversarial/perf/cost/safety on canonical matrix.
target: Seal P04-B10 block gate evidence, atom seals A01–A09, and P05 handoff contract.
hypothesis: A09 guard PASS enables block gate sealing without inventory or handoff drift.
acceptance: Block gate passes all atom seals, regression+guard PASS, orchestrator inventory wired.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A09
last_commit: pending
tests: PASS — forge-p04-researcher-phase-gate.guard.test.ts (9/9); forge-p04-researcher-phase-gate*.test.ts (54/54)
evidence: runForgeResearcherPhaseGateGuardGate + validateForgeResearcherPhaseGateGuard + verifyForgeResearcherPhaseGateGuard + runResearcherPhaseGateAdversarialGuardChecks
next: P04-B10-A10
