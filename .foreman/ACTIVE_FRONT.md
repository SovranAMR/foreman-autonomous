# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 240/1000
phase_progress: 41/100
block_progress: 1/10
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

P03-B05-A02 — Risk ve reversibility planı: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B05-A01 PASS; P03-B05-A02 define typed contract with measurable acceptance criteria for risk/reversibility probes.
target: getActiveStrategistRiskReversibilityContract, validateStrategistRiskReversibilityAgainstContract.
hypothesis: P03-B05-A02 formalizes the 27-probe A01 matrix into a versioned contract aligned to sealed P03-B04 handoff.
acceptance: contract declares all categories; fixture aligns; coverage validation passes.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A01
last_commit: f2a6b7c
tests: PASS — forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); harness 1.0.0-a01; 27 probes / 6 FAIL gaps
evidence: loadStrategistRiskReversibilityBaseline; validateStrategistRiskReversibilityBaseline; getForgeP03B04ToB05Handoff
next: P03-B05-A02
