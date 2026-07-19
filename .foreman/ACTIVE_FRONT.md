# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-B10-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 295/1000
phase_progress: 95/100
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

P03-B10-A07 — Stratejist phase gate: unit, property ve fuzz doğrulamasını ekle.

objective: P03-B10-A06 PASS; P03-B10-A07 property/fuzz validation slice for strategist phase gate contract probes.
target: runStrategistPhaseGatePropertyChecks and runStrategistPhaseGateRunRecordFuzzValidation reject invalid records; structural properties all pass.
hypothesis: P03-B10-A07 production slice validates contract structural invariants and run record fuzz rejection.
acceptance: property checks all pass; fuzz mutations rejected; slice atom tagged P03-B10-A07.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts, src/forge-p03-strategist-phase-gate.probe.ts
rollback: P03-B10-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B10-A06
last_commit: PENDING
tests: PASS — forge-p03-strategist-phase-gate-baseline.test.ts (3/3); forge-p03-strategist-phase-gate.test.ts (29/29)
evidence: runStrategistPhaseGateFailureRecoverySliceWithRecord; runStrategistPhaseGateEvidenceSlice; validateStrategistPhaseGateFailureRecoveryRunRecord; evidence/telemetry/provenance 7/7 PASS
next: P03-B10-A07
