# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A03
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 251/1000
phase_progress: 52/100
block_progress: 2/10
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

P03-B06-A03 — Kaynak ve budget planı: en küçük üretim dikey dilimini uygula.

objective: P03-B06-A02 PASS; P03-B06-A03 apply smallest production vertical slice for resource budget recovery.
target: recoverStrategistResourceBudget, runStrategistResourceBudgetProductionSlice.
hypothesis: P03-B06-A03 closes at least one documented FAIL gap via bounded strategist decompose recovery.
acceptance: production slice runs; at least one gap probe flips PASS; slice test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts, src/prompts.ts, src/parser.ts
rollback: P03-B06-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A02
last_commit: dfd1309
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (3/3); 27 probes; 6 documented FAIL gaps; contract coverage validated
evidence: getActiveStrategistResourceBudgetContract; validateStrategistResourceBudgetAgainstContract; validateStrategistResourceBudgetCoverage; summarizeStrategistResourceBudgetCoverage; FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1
next: P03-B06-A03
