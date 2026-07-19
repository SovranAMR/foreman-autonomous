# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B06
active_atom: P03-B06-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 249/1000
phase_progress: 50/100
block_progress: 0/10
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

P03-B06-A01 — Kaynak ve budget planı: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B05-A10 PASS; P03-B06-A01 measure resource/budget behavior and create failing baseline fixture from sealed B05 handoff.
target: loadStrategistResourceBudgetBaseline, validateStrategistResourceBudgetBaseline, runStrategistResourceBudgetProbes.
hypothesis: P03-B06-A01 establishes versioned baseline linked to P03-B05 block gate with documented measurable gaps.
acceptance: baseline loads; probes execute; B05 handoff alignment validated; baseline test suite passes.
commands: npx tsx --test src/forge-p03-strategist-resource-budget*.test.ts
blast_radius: src/forge-p03-strategist-resource-budget.ts
rollback: P03-B06-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A10
last_commit: 4e96dd4
tests: PASS — forge-p03-strategist-risk-reversibility*.test.ts (50/50); block gate 7/7
evidence: runStrategistRiskReversibilityBlockGate; FORGE_P03_B05_TO_B06_HANDOFF_V1
next: P03-B06-A01
