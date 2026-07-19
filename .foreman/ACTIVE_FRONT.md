# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 263/1000
phase_progress: 64/100
block_progress: 4/10
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

P03-B07-A05 — Parallel execution wave planı: failure, recovery ve NO-GO yollarını uygula.

objective: P03-B07-A04 PASS; P03-B07-A05 implement failure/recovery/NO-GO slice.
target: runStrategistParallelWaveFailureRecoverySlice, validateStrategistParallelWaveFailureRecoveryProbeMatrix.
hypothesis: P03-B07-A05 wires failure_path, recovery_path, nogo_path probes with zero unexpected mismatches.
acceptance: failure/recovery slice runs; matrix validation passes; PASS probes aligned; FAIL NO-GO gaps preserved.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A04
last_commit: df405b5
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (16/16); boundary 6/6 pass-aligned; zero unexpected mismatches
evidence: runStrategistParallelWaveBoundarySlice; validateStrategistParallelWaveBoundaryProbeMatrix
next: P03-B07-A05
