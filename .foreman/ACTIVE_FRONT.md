# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 66/1000
phase_progress: 65/100
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

P01-B07-A08 — Reproducible fixture sistemi: Forge entegrasyonu ile regression testini tamamla.

objective: A07 property/fuzz gates üzerine Forge regression entegrasyonunu uygula.
target: runReproducibleFixtureRegressionIntegration; detectReproducibleFixtureProbeRegression.
hypothesis: Regression integration detects probe alignment drift without false positives on canonical runs.
acceptance: regression integration test PASS; contract alignment preserved.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A08 regression slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A07
last_commit: 1c1917b
tests: PASS — forge-reproducible-fixture-baseline.test.ts (23/23)
evidence: runReproducibleFixturePropertyChecks; runReproducibleFixtureFuzzValidation; runReproducibleFixtureRunRecordFuzzValidation; propertyTotal=8; fuzzRejected=24; runFuzzRejected=5; harnessVersion=1.0.0-a07; sliceAtom=P01-B07-A06
next: P01-B07-A08
