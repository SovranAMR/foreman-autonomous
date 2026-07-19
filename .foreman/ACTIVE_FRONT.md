# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 93/1000
phase_progress: 92/100
block_progress: 9/10
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

P01-B10-A05 — Entegre Forge baseline gate: failure, recovery ve NO-GO yollarını uygula.

objective: A04 boundary slice sealed; failure/recovery/NO-GO category probes with zero unexpected mismatches.
target: runIntegratedBaselineFailureRecoverySlice + validateIntegratedBaselineFailureRecoveryProbeMatrix.
hypothesis: A04 boundary gate + failure/recovery contract probes sufficient for failure slice.
acceptance: failure/recovery slice executes 6 probes; passAligned=2; gapAligned=4; unexpectedMismatches=0.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/forge-integrated-baseline.probe.ts
rollback: B10-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A04 boundary matrix invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A04
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (13/13); runIntegratedBaselineBoundarySlice; validateIntegratedBaselineBoundaryProbeMatrix; 3 boundary probes; passAligned=3; gapAligned=0; unexpectedMismatches=0
evidence: runIntegratedBaselineBoundarySlice, validateIntegratedBaselineBoundaryProbeMatrix, contract-wired A04 boundary vertical slice gate
next: P01-B10-A05
