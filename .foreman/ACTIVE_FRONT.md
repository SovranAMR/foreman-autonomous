# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 267/1000
phase_progress: 68/100
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

P03-B07-A09 — Parallel execution wave planı: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B07-A08 PASS; P03-B07-A09 implement guard controls and adversarial/performance/cost/safety gate.
target: validateForgeStrategistParallelWaveGuard, runStrategistParallelWaveAdversarialGuardChecks.
hypothesis: P03-B07-A09 wires guard controls rejecting tampered records, false alignment and unsafe probe output.
acceptance: guard passes on canonical run; adversarial scenarios rejected; performance/cost/safety within bounds.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A08
last_commit: a32c2e4
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (36/36); regression gate PASS; probe regression detection 7/7
evidence: runStrategistParallelWaveForgeRegression; detectStrategistParallelWaveProbeRegression; validateStrategistParallelWaveProbeRegression
next: P03-B07-A09
