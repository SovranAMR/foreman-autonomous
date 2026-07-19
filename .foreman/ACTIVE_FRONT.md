# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 92/1000
phase_progress: 91/100
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

P01-B10-A04 — Entegre Forge baseline gate: boundary ve edge-case davranışlarını tamamla.

objective: A03 production slice sealed; boundary category probes with zero unexpected mismatches.
target: runIntegratedBaselineBoundarySlice + validateIntegratedBaselineBoundaryProbeMatrix.
hypothesis: A03 matrix gate + boundary contract probes sufficient for edge-case slice.
acceptance: boundary slice executes 3 probes; passAligned=3; gapAligned=0; unexpectedMismatches=0.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/forge-integrated-baseline.probe.ts
rollback: B10-A04 boundary slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A03 matrix invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A03
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (10/10); runIntegratedBaselineProductionSlice; validateIntegratedBaselineProbeMatrix; 24 probes; passAligned=16; gapAligned=8; unexpectedMismatches=0
evidence: runIntegratedBaselineProductionSlice, validateIntegratedBaselineProbeMatrix, contract-wired A03 production vertical slice gate
next: P01-B10-A04
