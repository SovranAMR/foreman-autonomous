# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A08
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 216/1000
phase_progress: 17/100
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

P03-B02-A08 — Block üretim kontratı: Forge entegrasyonu ile regression testini tamamla.

objective: P03-B02-A07 PASS; P03-B02-A08 Forge regression slice for block contract probes.
target: runStrategistBlockContractForgeRegression, detectStrategistBlockContractProbeRegression.
hypothesis: P03-B02-A08 closes Forge regression gate on canonical block contract matrix.
acceptance: regression slice PASS; zero probe alignment regression; run record gate intact.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A07 property/fuzz misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A07
last_commit: pending
tests: PASS — forge-p03-strategist-block-contract.test.ts (24/24); property 8/8; contract fuzz 72/72 rejected; run record fuzz 8/8 rejected
evidence: runStrategistBlockContractPropertyChecks; runStrategistBlockContractFuzzValidation; runStrategistBlockContractPropertyFuzzSlice
next: P03-B02-A08
