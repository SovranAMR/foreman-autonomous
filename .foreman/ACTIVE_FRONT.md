# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 254/1000
phase_progress: 55/100
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

P03-B06-A06 — Kaynak ve budget planı: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B06-A05 PASS; P03-B06-A06 implement evidence, telemetry and provenance record for resource budget.
target: runStrategistResourceBudgetFailureRecoverySliceWithRecord, validateStrategistResourceBudgetFailureRecoveryRunRecord.
hypothesis: P03-B06-A06 wires failure/recovery slice run record with disposition, criterion and aligned probe outcomes.
acceptance: evidence slice runs; run record validation passes; slice test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts
rollback: P03-B06-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B06-A05
last_commit: pending
tests: PASS — forge-p03-strategist-resource-budget.test.ts (9/9); forge-p03-strategist-resource-budget-baseline.test.ts (16/16); failure/recovery slice 7/7 probes; zero unexpected mismatches
evidence: validateStrategistResourceBudgetFailureRecoveryProbeMatrix; runStrategistResourceBudgetFailureRecoverySlice; 5 PASS + 2 documented NO-GO gaps aligned
next: P03-B06-A06
