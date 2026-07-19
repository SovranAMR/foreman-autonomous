# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 398/1000
phase_progress: 94/100
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

P04-B10-A09 — Araştırmacı phase gate: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B10-A08 PASS; Forge regression gate passes with zero probe regressions; guard foundation wired.
target: Validate adversarial/performance/cost/safety guard controls on researcher phase gate regression gate.
hypothesis: A08 guard foundation enables targeted A09 guard hardening without regression drift.
acceptance: Guard gate passes adversarial scenarios, perf/cost/safety bounds on canonical matrix.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A08
last_commit: d5b0a86
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); forge-p04-researcher-phase-gate.test.ts (16/16); forge-p04-researcher-phase-gate.property-fuzz.test.ts (6/6); forge-p04-researcher-phase-gate.regression.test.ts (7/7)
evidence: runForgeResearcherPhaseGateRegressionGate + detectResearcherPhaseGateProbeRegression + validateForgeResearcherPhaseGateGuard + runResearcherPhaseGateRegressionIntegration
next: P04-B10-A09
