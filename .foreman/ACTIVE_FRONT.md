# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 242/1000
phase_progress: 43/100
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

P03-B05-A04 — Risk ve reversibility planı: boundary ve edge-case davranışlarını tamamla.

objective: P03-B05-A03 PASS; P03-B05-A04 implement boundary slice for risk/reversibility edge cases.
target: runStrategistRiskReversibilityBoundarySlice, validateStrategistRiskReversibilityBoundaryProbeMatrix.
hypothesis: P03-B05-A04 wires boundary-category probes into recoverable production seam with zero unexpected mismatches.
acceptance: boundary slice runs; contract-aligned boundary probes pass; zero unexpected mismatches on PASS probes.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A03
last_commit: pending
tests: PASS — forge-p03-strategist-risk-reversibility.test.ts (13/13); forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); production slice 21 pass / 6 documented FAIL gaps
evidence: recoverStrategistRiskReversibility; runStrategistRiskReversibilityProductionSlice; validateStrategistRiskReversibilityProbeMatrix
next: P03-B05-A04
