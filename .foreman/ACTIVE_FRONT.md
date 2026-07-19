# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 378/1000
phase_progress: 77/100
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

P04-B08-A09 — Spike ve falsification deneyi: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B08-A08 PASS; guard controls for spike falsification regression gate.
target: Adversarial/performance/cost/safety guard validation on canonical spike falsification matrix.
hypothesis: Guard controls reject tampered records and enforce zero-cost deterministic probe runs.
acceptance: Guard checks pass; adversarial scenarios rejected; performance/cost/safety within bounds.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification*.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A08
last_commit: 318c8a7
tests: PASS — forge-p04-researcher-spike-falsification*.test.ts (50/50); regression gate 23/23 aligned; productionSlice+propertyFuzz+runRecord green; adversarial=3/3
evidence: runResearcherSpikeFalsificationForgeRegression + orchestrator verifyForgeResearcherSpikeFalsificationRegression
next: P04-B08-A09
