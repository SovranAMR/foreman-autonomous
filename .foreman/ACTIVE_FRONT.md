# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 268/1000
phase_progress: 69/100
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

P03-B07-A10 — Parallel execution wave planı: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B07-A09 PASS; P03-B07-A10 seal block gate evidence and handoff to P03-B08.
target: sealStrategistParallelWaveBlockGate, validateStrategistParallelWaveBlockHandoff.
hypothesis: P03-B07-A10 wires block gate seal with regression+guard PASS and valid P03-B08 handoff contract.
acceptance: block gate sealed; handoff valid; probe count and atom seals match B07 completion.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A09
last_commit: e36eb94
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (43/43); guard adversarial 3/3; performance/cost/safety PASS
evidence: validateForgeStrategistParallelWaveGuard; runStrategistParallelWaveAdversarialGuardChecks; runForgeStrategistParallelWaveRegressionGate
next: P03-B07-A10
