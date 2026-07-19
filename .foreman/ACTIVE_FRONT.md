# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A08
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 257/1000
phase_progress: 58/100
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

P03-B06-A09 — Kaynak ve budget planı: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B06-A08 PASS; P03-B06-A09 implement adversarial/performance/cost/safety guard controls for resource budget contract.
target: validateForgeStrategistResourceBudgetGuard, runStrategistResourceBudgetAdversarialGuardChecks.
hypothesis: P03-B06-A09 wires resource budget guard controls into Forge pipeline integration gate.
acceptance: guard rejects tampered records; performance/cost/safety bounds enforced; slice test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts
rollback: P03-B06-A09 guard control değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A08
last_commit: pending
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (33/33); regression 7/7; forge integration gate PASS
evidence: runStrategistResourceBudgetForgeRegression; detectStrategistResourceBudgetProbeRegression; validateStrategistResourceBudgetProbeRegression; runStrategistResourceBudgetProbeRegression
next: P03-B06-A09
