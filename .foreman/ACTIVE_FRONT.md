# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 213/1000
phase_progress: 14/100
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

P03-B02-A05 — Block üretim kontratı: failure, recovery ve NO-GO yollarını uygula.

objective: P03-B02-A04 PASS; P03-B02-A05 failure/recovery slice for block contract probes.
target: runStrategistBlockContractFailureRecoverySlice, validateStrategistBlockContractFailureRecoveryProbeMatrix.
hypothesis: P03-B02-A05 closes failure/recovery/NO-GO paths with zero unexpected mismatches.
acceptance: failure/recovery slice exported; six probes aligned; zero unexpected mismatches on failure matrix.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A04 boundary misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A04
last_commit: 69d5b4c
tests: PASS — forge-p03-strategist-block-contract.test.ts (11/11); forge-p03-strategist-block-contract-baseline.test.ts (3/3); boundary 6 probes; 0 unexpected mismatches
evidence: runStrategistBlockContractBoundarySlice; validateStrategistBlockContractBoundaryProbeMatrix; assessStrategistBlockInputBoundary
next: P03-B02-A05
