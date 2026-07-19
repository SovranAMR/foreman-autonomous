# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 258/1000
phase_progress: 59/100
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

P03-B06-A10 — Kaynak ve budget planı: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B06-A09 PASS; P03-B06-A10 seal resource budget block gate and handoff to P03-B07.
target: sealStrategistResourceBudgetBlockGate, runForgeStrategistResourceBudgetBlockGate.
hypothesis: P03-B06-A10 seals P03-B06 block with regression+guard gates and B07 handoff contract.
acceptance: block gate seals A01–A09; handoff valid; block gate test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts, src/forge-p03-strategist-resource-budget.probe.ts
rollback: P03-B06-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A09
last_commit: pending
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (40/40); guard adversarial 3/3; regression gate PASS
evidence: validateForgeStrategistResourceBudgetGuard; runStrategistResourceBudgetAdversarialGuardChecks; runForgeStrategistResourceBudgetRegressionGate
next: P03-B06-A10
