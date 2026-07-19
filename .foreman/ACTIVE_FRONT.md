# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 252/1000
phase_progress: 53/100
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

P03-B06-A04 — Kaynak ve budget planı: boundary ve edge-case davranışlarını tamamla.

objective: P03-B06-A03 PASS; P03-B06-A04 complete boundary and edge-case behavior for resource budget recovery.
target: assessStrategistResourceBudgetInputBoundary, validateStrategistResourceBudgetBoundaryProbeMatrix.
hypothesis: P03-B06-A04 extends boundary probes with zero unexpected mismatches on decompose input edge cases.
acceptance: boundary slice runs; boundary probe matrix valid; slice test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts
rollback: P03-B06-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A03
last_commit: 87e18fd
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (9/9); 27 probes; 4 documented FAIL gaps; 2 gaps closed (prompt_decompose_resource_plan, parser_resource_plan_fields)
evidence: recoverStrategistResourceBudget; validateStrategistResourceBudget; runStrategistResourceBudgetProductionSlice; validateStrategistResourceBudgetProbeMatrix; RESOURCE PLAN/TOKEN BUDGET in prompts+parser
next: P03-B06-A04
