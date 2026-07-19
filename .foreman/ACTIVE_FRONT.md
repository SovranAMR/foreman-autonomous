# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 244/1000
phase_progress: 45/100
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

P03-B05-A06 — Risk ve reversibility planı: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B05-A05 PASS; P03-B05-A06 implement evidence/telemetry slice for risk/reversibility run records.
target: runStrategistRiskReversibilityFailureRecoverySliceWithRecord, validateStrategistRiskReversibilityFailureRecoveryRunRecord, runStrategistRiskReversibilityEvidenceSlice.
hypothesis: P03-B05-A06 wires evidence/telemetry/provenance into recoverable production seam with zero unexpected mismatches.
acceptance: evidence slice runs; contract-aligned run record validates; zero unexpected mismatches on PASS probes; documented FAIL gaps preserved.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A06 evidence/telemetry slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A05
last_commit: pending
tests: PASS — forge-p03-strategist-risk-reversibility.test.ts (19/19); forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); failure/recovery slice 7 pass / 2 gap aligned / 0 unexpected mismatches
evidence: runStrategistRiskReversibilityFailureRecoverySlice; validateStrategistRiskReversibilityFailureRecoveryProbeMatrix
next: P03-B05-A06
