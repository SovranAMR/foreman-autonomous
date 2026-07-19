# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 328/1000
phase_progress: 28/100
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

P04-B03-A09 — Web ve primary-source araştırma: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B03-A08 PASS; guard controls sealed with dedicated guard test suite.
target: validateForgeResearcherWebPrimarySourceGuard, adversarial scenarios, performance/cost/safety limits.
hypothesis: Guard rejects tampered records while canonical matrix stays green.
acceptance: guard test suite PASS; A01-A08 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher-web-primary-source*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A08
last_commit: PENDING
tests: PASS — forge-p04-researcher*.test.ts; probes=23/23; propertyFuzz=8/8; contractFuzz rejected=24/24; runRecordFuzz rejected=5/5; guard adversarial=3/3
evidence: runResearcherWebPrimarySourceForgeRegression; runForgeResearcherWebPrimarySourceRegressionGate; forge-p04-researcher-web-primary-source.regression.test.ts
next: P04-B03-A09
