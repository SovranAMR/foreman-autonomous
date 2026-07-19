# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 265/1000
phase_progress: 66/100
block_progress: 6/10
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

P03-B07-A07 — Parallel execution wave planı: unit, property ve fuzz doğrulamasını ekle.

objective: P03-B07-A06 PASS; P03-B07-A07 implement property/fuzz validation slice.
target: runStrategistParallelWavePropertyChecks, runStrategistParallelWaveFuzzValidation, runStrategistParallelWaveRunRecordFuzzValidation.
hypothesis: P03-B07-A07 wires structural property checks and deterministic fuzz rejection for parallel wave contract and run records.
acceptance: property checks pass; fuzz rejects mutations; run record fuzz validates; PASS probes aligned; FAIL NO-GO gaps preserved.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A06
last_commit: 94195d4
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (23/23); evidence slice 7/7 aligned; run record validation passes; zero unexpected mismatches
evidence: runStrategistParallelWaveFailureRecoverySliceWithRecord; validateStrategistParallelWaveFailureRecoveryRunRecord; runStrategistParallelWaveEvidenceSlice
next: P03-B07-A07
