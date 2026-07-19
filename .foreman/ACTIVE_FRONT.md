# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 255/1000
phase_progress: 56/100
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

P03-B06-A07 — Kaynak ve budget planı: unit, property ve fuzz doğrulamasını ekle.

objective: P03-B06-A06 PASS; P03-B06-A07 implement unit, property and fuzz validation for resource budget.
target: runStrategistResourceBudgetPropertyChecks, runStrategistResourceBudgetFuzzValidation.
hypothesis: P03-B06-A07 adds structural property checks and deterministic fuzz rejection for resource budget contract.
acceptance: property checks pass; fuzz rejects mutations; slice test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts
rollback: P03-B06-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Property/fuzz blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A06
last_commit: pending
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (20/20); evidence slice 7/7 probes; run record validation passes
evidence: validateStrategistResourceBudgetFailureRecoveryRunRecord; runStrategistResourceBudgetFailureRecoverySliceWithRecord; runStrategistResourceBudgetEvidenceSlice; disposition/criterion/aligned probe outcomes
next: P03-B06-A07
