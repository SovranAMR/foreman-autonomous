# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 65/1000
phase_progress: 64/100
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

P01-B07-A07 — Reproducible fixture sistemi: unit, property ve fuzz doğrulamasını ekle.

objective: A06 failure/recovery run record üzerine property/fuzz doğrulamasını uygula.
target: runReproducibleFixturePropertyChecks; runReproducibleFixtureFuzzValidation; runReproducibleFixtureRunRecordFuzzValidation.
hypothesis: Property/fuzz gates reject mutated fixtures and tampered run records without regressions.
acceptance: property/fuzz test PASS; contract alignment preserved.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A07 property/fuzz slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A06
last_commit: 862ef68
tests: PASS — forge-reproducible-fixture-baseline.test.ts (19/19)
evidence: runReproducibleFixtureFailureRecoverySliceWithRecord; validateReproducibleFixtureFailureRecoveryRunRecord; failureRecoveryProbeCount=6; evidence=6; telemetry=6; sliceAtom=P01-B07-A06; matrixValid=true; mismatches=0
next: P01-B07-A07
