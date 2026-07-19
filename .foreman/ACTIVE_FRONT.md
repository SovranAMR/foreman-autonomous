# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 95/1000
phase_progress: 94/100
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

P01-B10-A07 — Entegre Forge baseline gate: unit, property ve fuzz doğrulamasını ekle.

objective: A06 evidence slice sealed; property/fuzz validation for integrated gate run records.
target: runIntegratedBaselineRunRecordFuzzValidation + integrated baseline structural properties.
hypothesis: A06 run record validation + contract probes sufficient for property/fuzz slice.
acceptance: property checks pass; fuzz mutations reject tampered integrated baseline run records.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/forge-integrated-baseline.probe.ts
rollback: B10-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A06 run record invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A06
last_commit: e2adb34
tests: PASS — forge-integrated-baseline*.test.ts (18/18); runIntegratedBaselineFailureRecoverySliceWithRecord; validateIntegratedBaselineFailureRecoveryRunRecord; 6 failure/recovery probes with disposition, criterion and aligned outcomes
evidence: runIntegratedBaselineFailureRecoverySliceWithRecord, validateIntegratedBaselineFailureRecoveryRunRecord, contract-wired A06 evidence/telemetry/provenance vertical slice gate
next: P01-B10-A07
