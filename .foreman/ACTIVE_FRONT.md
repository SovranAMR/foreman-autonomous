# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 237/1000
phase_progress: 38/100
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

P03-B04-A09 — Dependency DAG: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B04-A08 PASS; P03-B04-A09 implement guard controls for dependency DAG evidence slice.
target: validateForgeStrategistDependencyDagGuard, runStrategistDependencyDagAdversarialGuardChecks.
hypothesis: P03-B04-A09 closes adversarial/performance/cost/safety gaps for dependency DAG evidence slice.
acceptance: guard slice passes; adversarial scenarios rejected; performance/cost/safety within bounds.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A08
last_commit: pending
tests: PASS — forge-p03-strategist-dependency-dag.test.ts; forge-p03-strategist-dependency-dag-baseline.test.ts; harness 1.0.0-a08; regression slice zero unexpected mismatches
evidence: runStrategistDependencyDagForgeRegression; runStrategistDependencyDagProbeRegression; detectStrategistDependencyDagProbeRegression
next: P03-B04-A09
