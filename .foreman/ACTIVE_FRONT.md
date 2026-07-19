# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 214/1000
phase_progress: 15/100
block_progress: 5/10
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

P03-B02-A06 — Block üretim kontratı: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B02-A05 PASS; P03-B02-A06 evidence/telemetry slice for block contract probes.
target: runStrategistBlockContractFailureRecoverySliceWithRecord, validateStrategistBlockContractFailureRecoveryRunRecord.
hypothesis: P03-B02-A06 closes evidence/telemetry/provenance for failure/recovery slice with aligned run record gate.
acceptance: failure/recovery run record exported; six probes aligned; run record gate PASS.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A05 failure matrix misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A05
last_commit: a2b840d
tests: PASS — forge-p03-strategist-block-contract.test.ts (14/14); forge-p03-strategist-block-contract-baseline.test.ts (3/3); failure/recovery 6 probes; 0 unexpected mismatches
evidence: runStrategistBlockContractFailureRecoverySlice; validateStrategistBlockContractFailureRecoveryProbeMatrix; listStrategistBlockContractFailureRecoveryProbeIds
next: P03-B02-A06
