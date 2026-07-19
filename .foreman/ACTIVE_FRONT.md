# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 362/1000
phase_progress: 62/100
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

P04-B07-A03 — Risk ve trade-off araştırması: en küçük üretim dikey dilimini uygula.

objective: P04-B07-A02 PASS; typed contract validates; 23 probes wired; 4 documented FAIL gaps preserved.
target: Implement smallest production slice closing trade-off parser and orchestrator validator gaps where feasible.
hypothesis: Production slice exports parseResearchTradeoffs and validateResearchRiskTradeoff with probe alignment.
acceptance: Production slice runs; probe matrix validates; documented gaps reduced or preserved with evidence.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts, src/parser.ts, src/orchestrator.ts
rollback: P04-B07-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A02
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (17/17); contract coverage validates; fixture aligned; documented FAIL gaps=4
evidence: getActiveResearcherRiskTradeoffContract + validateResearcherRiskTradeoffContractCoverage + validateResearcherRiskTradeoffAgainstContract + forge-p04-researcher-risk-tradeoff.test.ts A02 suite; risk_signal/tradeoff_signal/nogo_path dispositions wired
next: P04-B07-A03
