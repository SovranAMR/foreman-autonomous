# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A03
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 211/1000
phase_progress: 12/100
block_progress: 1/10
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

P03-B02-A03 — Block üretim kontratı: en küçük üretim dikey dilimini uygula.

objective: P03-B02-A02 PASS; P03-B02-A03 recoverStrategistBlockProduction production slice.
target: recoverStrategistBlockProduction, runStrategistBlockContractProductionSlice.
hypothesis: P03-B02-A03 closes sblk.structured_block_recovery gap with contract-wired recovery slice.
acceptance: recovery function exported; probe matrix gap aligned; zero unexpected mismatches on PASS probes.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A03 recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A02 contract misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A02
last_commit: pending
tests: PASS — forge-p03-strategist-block-contract.test.ts (5/5); contract v1 23 probes; 1 documented FAIL gap preserved
evidence: getActiveStrategistBlockContract; validateStrategistBlockContractCoverage; validateStrategistBlockContractAgainstContract
next: P03-B02-A03
