# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 259/1000
phase_progress: 60/100
block_progress: 0/10
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

P03-B07-A01 — Parallel execution wave planı: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B06-A10 PASS; P03-B07-A01 measure parallel execution wave behavior and create failing baseline fixture.
target: loadStrategistParallelWaveBaseline, validateStrategistParallelWaveBaseline.
hypothesis: P03-B07-A01 captures parallel wave planning gaps against sealed P03-B06 resource budget block gate.
acceptance: baseline fixture loads; probes document measurable gaps; validation passes on canonical fixture.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A10
last_commit: pending
tests: PASS — forge-p03-strategist-resource-budget*.test.ts (56/56); block gate 7/7; regression+guard integrated
evidence: sealStrategistResourceBudgetBlockGate; runForgeStrategistResourceBudgetBlockGate; verifyForgeStrategistResourceBudgetBlockGate
next: P03-B07-A01
