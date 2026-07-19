# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 368/1000
phase_progress: 67/100
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

P04-B07-A09 — Risk ve trade-off araştırması: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B07-A08 PASS; runForgeResearcherRiskTradeoffRegressionGate wired; 23/23 probes aligned; property/fuzz + guard in regression gate.
target: Dedicated guard test suite for risk trade-off adversarial, performance, cost and safety controls.
hypothesis: Guard controls reject tampered records without false positives on canonical matrix.
acceptance: Guard suite validates; regression gate guard metrics 3/3 adversarial rejected.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff.guard.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A08
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (46/46); regression gate 23/23 aligned; property/fuzz in regression; guard adversarial=3/3
evidence: runResearcherRiskTradeoffForgeRegression + runForgeResearcherRiskTradeoffRegressionGate + detectResearcherRiskTradeoffProbeRegression + validateForgeResearcherRiskTradeoffGuard; harnessVersion 1.0.0-a08
next: P04-B07-A09
