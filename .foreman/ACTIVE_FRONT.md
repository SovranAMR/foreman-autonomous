# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 247/1000
phase_progress: 48/100
block_progress: 8/10
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

P03-B05-A09 — Risk ve reversibility planı: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B05-A08 PASS; P03-B05-A09 implement adversarial/performance/cost/safety guard controls for risk/reversibility run records.
target: validateForgeStrategistRiskReversibilityGuard, runStrategistRiskReversibilityAdversarialGuardChecks.
hypothesis: P03-B05-A09 rejects tampered records, enforces zero-cost deterministic execution, and flags forbidden secret patterns.
acceptance: guard slice passes; adversarial scenarios rejected; performance/cost/safety budgets enforced; canonical run passes.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A08
last_commit: pending
tests: PASS — forge-p03-strategist-risk-reversibility.test.ts (34/34); forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); regression slice 5/5
evidence: runStrategistRiskReversibilityForgeRegression; detectStrategistRiskReversibilityProbeRegression
next: P03-B05-A09
