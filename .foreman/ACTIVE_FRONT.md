# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 63/1000
phase_progress: 62/100
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

P01-B07-A05 — Reproducible fixture sistemi: failure, recovery ve NO-GO yollarını uygula.

objective: A04 boundary slice üzerine failure/recovery/NO-GO davranışlarını uygula.
target: runReproducibleFixtureFailureRecoverySlice; contract-wired failure/recovery/NO-GO probe execution.
hypothesis: Failure/recovery slice closes path gaps without regressions on PASS probes.
acceptance: failure/recovery slice test PASS; contract alignment preserved.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A05 failure/recovery slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A04
last_commit: pending
tests: PASS — forge-reproducible-fixture-baseline.test.ts (14/14)
evidence: runReproducibleFixtureBoundarySlice; validateReproducibleFixtureBoundaryProbeMatrix; boundaryProbeCount=3; matrixValid=true; unexpectedMismatches=0
next: P01-B07-A05
