# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 369/1000
phase_progress: 68/100
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

P04-B07-A10 — Risk ve trade-off araştırması: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B07-A09 PASS; guard suite 8/8; adversarial=3/3; orchestrator verifyForgeResearcherRiskTradeoffGuard wired.
target: Block gate test suite sealing risk trade-off matrix with guard + regression + property/fuzz evidence.
hypothesis: Block gate PASS aggregates canonical probes, guard controls and sealed handoff contract.
acceptance: Block gate suite validates; handoff fixture ready for P04-B08.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff-block-gate.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A09
last_commit: e7efc42
tests: PASS — forge-p04-researcher-risk-tradeoff.guard.test.ts (8/8); guard adversarial=3/3; orchestrator researcher_risk_tradeoff_guard verification
evidence: validateForgeResearcherRiskTradeoffGuard + runResearcherRiskTradeoffAdversarialGuardChecks + verifyForgeResearcherRiskTradeoffGuard; harnessVersion 1.0.0-a09
next: P04-B07-A10
