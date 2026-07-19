# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 60/1000
phase_progress: 59/100
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

P01-B07-A02 — Reproducible fixture sistemi: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: A01 baseline üzerine typed reproducible fixture contract tanımla.
target: getActiveReproducibleFixtureContract; validateReproducibleFixtureContractCoverage.
hypothesis: Typed contract maps 21 baseline probes with measurable acceptance criteria.
acceptance: contract test PASS; all eight categories declare minProbeCount and criteria.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts, fixtures/
rollback: A02 contract değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: contract uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A01
last_commit: PENDING
tests: PASS — forge-reproducible-fixture-baseline.test.ts (3/3)
evidence: loadReproducibleFixtureBaseline; validateReproducibleFixtureBaseline; 21-probe matrix with 7 documented FAIL gaps from B06 sealed handoff
next: P01-B07-A02
