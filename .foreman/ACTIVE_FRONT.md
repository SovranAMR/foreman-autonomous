# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 262/1000
phase_progress: 63/100
block_progress: 3/10
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

P03-B07-A03 — Parallel execution wave planı: en küçük üretim dikey dilimini uygula.

objective: P03-B07-A02 PASS; P03-B07-A03 implement smallest production vertical slice.
target: runStrategistParallelWaveProductionSlice, validateStrategistParallelWaveProbeMatrix.
hypothesis: P03-B07-A03 wires contract probe execution with zero unexpected mismatches.
acceptance: production slice runs; matrix validation passes; PASS probes aligned; FAIL gaps preserved.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A03
last_commit: 15f3adf
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (13/13); 21 pass-aligned; 6 gap-aligned; zero unexpected mismatches
evidence: runStrategistParallelWaveProductionSlice; validateStrategistParallelWaveProbeMatrix
next: P03-B07-A04
