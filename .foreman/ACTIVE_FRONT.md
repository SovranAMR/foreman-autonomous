# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 248/1000
phase_progress: 49/100
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

P03-B05-A10 — Risk ve reversibility planı: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B05-A09 PASS; P03-B05-A10 seal risk/reversibility block gate and prepare P03-B06 handoff contract.
target: runStrategistRiskReversibilityBlockGate, getForgeP03B05BlockGate, buildStrategistRiskReversibilityBlockGateEvidence.
hypothesis: P03-B05-A10 seals all 10 B05 atoms, validates regression+guard gates, and emits B06 entry handoff.
acceptance: block gate suite passes; handoff contract valid; orchestrator verification hook wired.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B05-A09
last_commit: a876a74
tests: PASS — forge-p03-strategist-risk-reversibility.test.ts (40/40); forge-p03-strategist-risk-reversibility-baseline.test.ts (3/3); guard slice 6/6
evidence: validateForgeStrategistRiskReversibilityGuard; runStrategistRiskReversibilityAdversarialGuardChecks
next: P03-B05-A10
