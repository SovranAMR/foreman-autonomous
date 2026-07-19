# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 212/1000
phase_progress: 13/100
block_progress: 2/10
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

P03-B02-A04 — Block üretim kontratı: boundary ve edge-case davranışlarını tamamla.

objective: P03-B02-A03 PASS; P03-B02-A04 boundary slice for block contract probes.
target: runStrategistBlockContractBoundarySlice, validateStrategistBlockContractBoundaryProbeMatrix.
hypothesis: P03-B02-A04 closes boundary-category edge cases with zero unexpected mismatches.
acceptance: boundary slice exported; boundary probes aligned; zero unexpected mismatches on boundary matrix.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A03 recovery misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A03
last_commit: 33b329d
tests: PASS — forge-p03-strategist-block-contract.test.ts (8/8); forge-p03-strategist-block-contract-baseline.test.ts (3/3); contract v1 23 probes; 0 FAIL gaps
evidence: recoverStrategistBlockProduction; runStrategistBlockContractProductionSlice; validateStrategistBlockContractProbeMatrix
next: P03-B02-A04
