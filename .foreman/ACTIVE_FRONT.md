# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 245/1000
phase_progress: 46/100
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

P03-B05-A07 — Risk ve reversibility planı: unit, property ve fuzz doğrulamasını ekle.

objective: P03-B05-A06 PASS; P03-B05-A07 implement property/fuzz validation slice for risk/reversibility run records.
target: runStrategistRiskReversibilityPropertyChecks, runStrategistRiskReversibilityFuzzValidation, runStrategistRiskReversibilityRunRecordFuzzValidation.
hypothesis: P03-B05-A07 wires structural properties and deterministic fuzz mutations into recoverable production seam with zero unexpected mismatches.
acceptance: property checks pass; fuzz rejects all mutations; run record fuzz validation passes; zero unexpected mismatches on PASS probes; documented FAIL gaps preserved.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A06
last_commit: pending
tests: PASS — forge-p03-strategist-risk-reversibility.test.ts (23/23); forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); evidence slice 7 pass / 2 gap aligned / 0 unexpected mismatches
evidence: runStrategistRiskReversibilityEvidenceSlice; validateStrategistRiskReversibilityFailureRecoveryRunRecord
next: P03-B05-A07
