# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 360/1000
phase_progress: 60/100
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

P04-B07-A01 — Risk ve trade-off araştırması: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B06-A10 PASS; block gate sealed; B07 handoff contract valid; contradiction freshness suite green.
target: Measure risk and trade-off research baseline from sealed P04-B06 contradiction freshness block gate.
hypothesis: B07 baseline fixture links to sealed B06 handoff with documented FAIL gaps for risk/trade-off probes.
acceptance: Baseline loads; fixture validates; probe matrix aligned; failing gaps documented.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A10
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (60/60); block gate seals=10/10; handoff=PASS→P04-B07; orchestrator researcher_contradiction_freshness_block_gate wired
evidence: runResearcherContradictionFreshnessBlockGate + validateResearcherContradictionFreshnessBlockHandoffContract + forge-p04-researcher-contradiction-freshness-block-gate.test.ts; orchestrator verifyForgeResearcherContradictionFreshnessBlockGate
next: P04-B07-A01
