# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 238/1000
phase_progress: 39/100
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

P03-B04-A10 — Dependency DAG: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B04-A09 PASS; P03-B04-A10 seal dependency DAG block gate and produce handoff to P03-B05.
target: sealStrategistDependencyDagBlockGate, getForgeP03B04ToB05Handoff.
hypothesis: P03-B04-A10 closes P03-B04 block with sealed gate evidence and valid handoff contract.
acceptance: block gate sealed; all 10 atoms PASS; handoff contract valid for P03-B05 entry.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A09
last_commit: e890608
tests: PASS — forge-p03-strategist-dependency-dag.test.ts; forge-p03-strategist-dependency-dag-baseline.test.ts; harness 1.0.0-a09; guard slice adversarial/performance/cost/safety within bounds
evidence: validateForgeStrategistDependencyDagGuard; runStrategistDependencyDagAdversarialGuardChecks
next: P03-B04-A10
