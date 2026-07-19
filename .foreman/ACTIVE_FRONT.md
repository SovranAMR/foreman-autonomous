# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 366/1000
phase_progress: 65/100
block_progress: 6/10
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

P04-B07-A07 — Risk ve trade-off araştırması: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B07-A06 PASS; runResearcherRiskTradeoffEvidenceSlice wired; 6/6 evidence slice probes aligned; telemetry and provenance validated.
target: Add unit, property and fuzz validation for risk trade-off contract invariants and run record gates.
hypothesis: Property/fuzz gates reject tampered evidence, telemetry and provenance without loosening probe matrix.
acceptance: Property/fuzz suite validates; run record gates hold; contract invariants enforced.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A06
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (32/32); evidence slice 6/6 aligned; telemetry and provenance validated; zero unexpected mismatches
evidence: validateResearcherRiskTradeoffEvidenceRunRecord + runResearcherRiskTradeoffEvidenceSlice; buildResearcherRiskTradeoffRunRecord; runResearcherRiskTradeoffFailureRecoverySliceWithRecord; harnessVersion 1.0.0-a06
next: P04-B07-A07
