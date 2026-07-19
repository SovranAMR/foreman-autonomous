# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-B10-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 294/1000
phase_progress: 94/100
block_progress: 5/10
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

P03-B10-A06 — Stratejist phase gate: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B10-A05 PASS; P03-B10-A06 evidence/telemetry/provenance slice for strategist phase gate contract probes.
target: runStrategistPhaseGateFailureRecoverySliceWithRecord emits auditable evidence, telemetry and provenance with zero mismatches.
hypothesis: P03-B10-A06 production slice validates run record bundling for failure/recovery probe subset.
acceptance: evidence/telemetry/provenance record valid; zero mismatches; slice atom tagged P03-B10-A06.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts, src/forge-p03-strategist-phase-gate.probe.ts
rollback: P03-B10-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B10-A05
last_commit: pending
tests: PASS — forge-p03-strategist-phase-gate-baseline.test.ts (3/3); forge-p03-strategist-phase-gate.test.ts (25/25)
evidence: runStrategistPhaseGateFailureRecoverySlice; validateStrategistPhaseGateFailureRecoveryProbeMatrix; failure/recovery/NO-GO 7/7 PASS
next: P03-B10-A06
