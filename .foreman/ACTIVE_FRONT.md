# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 358/1000
phase_progress: 58/100
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

P04-B06-A09 — Contradiction ve freshness çözümü: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B06-A08 PASS; regression exports; probe alignment drift detection; property/fuzz slice green; guard foundation exported.
target: Forge contradiction freshness adversarial guard gate with performance, cost and safety controls.
hypothesis: Guard gate rejects tampered records and false alignment without weakening A08 regression or A07 property/fuzz gates.
acceptance: Guard exports; regression slice remains green; guard suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A08
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (45/45); regression gate 23/23 probes aligned; property/fuzz slice 8/8 properties + 72/72 contract fuzz rejected + 5/5 run record fuzz rejected; guard adversarial=3/3
evidence: runForgeResearcherContradictionFreshnessRegressionGate + runResearcherContradictionFreshnessRegressionIntegration + detectResearcherContradictionFreshnessProbeRegression + runResearcherContradictionFreshnessForgeRegression + validateForgeResearcherContradictionFreshnessGuard exported; orchestrator verifyForgeResearcherContradictionFreshnessRegression wired
next: P04-B06-A09
