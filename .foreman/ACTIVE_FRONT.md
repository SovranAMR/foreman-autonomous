# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-B10-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 297/1000
phase_progress: 97/100
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

P03-B10-A09 — Stratejist phase gate: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B10-A08 PASS; P03-B10-A09 guard controls for strategist phase gate regression gate.
target: validateForgeStrategistPhaseGateGuard rejects tampered records; perf/cost/safety thresholds enforced.
hypothesis: P03-B10-A09 guard slice embeds adversarial scenarios on strategist phase gate run records.
acceptance: guard gate PASS; adversarial/perf/cost/safety embedded; slice atom tagged P03-B10-A09.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts, src/forge-p03-strategist-phase-gate.probe.ts
rollback: P03-B10-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B10-A08
last_commit: pending
tests: PASS — forge-p03-strategist-phase-gate-baseline.test.ts (3/3); forge-p03-strategist-phase-gate.test.ts (38/38); forge-p03-strategist-phase-gate.property-fuzz.test.ts (6/6)
evidence: runForgeStrategistPhaseGateRegressionGate atom=P03-B10-A08 24/24 aligned; propertyFuzz 8/8; contractFuzz rejected=24/24; runFuzz rejected=5/5; zero probe regressions
next: P03-B10-A09
