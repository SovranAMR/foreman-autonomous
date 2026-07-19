# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 61/1000
phase_progress: 60/100
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

P01-B07-A03 — Reproducible fixture sistemi: en küçük üretim dikey dilimini uygula.

objective: A02 contract üzerine en küçük üretim dikey dilimini uygula.
target: runReproducibleFixtureProductionSlice; contract-wired probe execution.
hypothesis: Production slice closes at least one documented FAIL gap without regressions.
acceptance: production slice test PASS; contract alignment preserved.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A03 production slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A02
last_commit: 26d35ae
tests: PASS — forge-reproducible-fixture-baseline.test.ts (9/9)
evidence: getActiveReproducibleFixtureContract; validateReproducibleFixtureContractCoverage; 21-probe typed contract with 8 categories minProbeCount+criteria; fixture↔contract alignment
next: P01-B07-A03
