# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 361/1000
phase_progress: 61/100
block_progress: 1/10
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

P04-B07-A02 — Risk ve trade-off araştırması: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B07-A01 PASS; baseline fixture validates; B06 handoff linked; 4 documented FAIL gaps aligned.
target: Define typed risk/trade-off contract with measurable acceptance criteria wired to A01 probe matrix.
hypothesis: Contract v1 declares risk_signal, tradeoff_signal and nogo_path probes with documented gap dispositions.
acceptance: Contract loads; coverage validates; fixture aligned; gap probes preserved.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A01
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (9/9); baseline validates; probe matrix aligned; documented FAIL gaps=4
evidence: loadResearcherRiskTradeoffBaseline + validateResearcherRiskTradeoffBaseline + runResearcherRiskTradeoffProbes + forge-p04-researcher-risk-tradeoff.test.ts; B06 handoff sealed probeCount=23
next: P04-B07-A02
