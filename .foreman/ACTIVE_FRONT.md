# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 62/1000
phase_progress: 61/100
block_progress: 3/10
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

P01-B07-A04 — Reproducible fixture sistemi: boundary ve edge-case davranışlarını tamamla.

objective: A03 production slice üzerine boundary ve edge-case davranışlarını uygula.
target: runReproducibleFixtureBoundarySlice; contract-wired boundary probe execution.
hypothesis: Boundary slice closes edge-case gaps without regressions on PASS probes.
acceptance: boundary slice test PASS; contract alignment preserved.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A04 boundary slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A03
last_commit: pending
tests: PASS — forge-reproducible-fixture-baseline.test.ts (11/11)
evidence: runReproducibleFixtureProductionSlice; validateReproducibleFixtureProbeMatrix; canonicalFixtureHash SHA-256; fix.canonical_fixture_hash gap closed (7→6 documented FAIL gaps)
next: P01-B07-A04
