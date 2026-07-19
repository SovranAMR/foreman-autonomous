# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 365/1000
phase_progress: 64/100
block_progress: 5/10
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

P04-B07-A06 — Risk ve trade-off araştırması: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B07-A05 PASS; runResearcherRiskTradeoffFailureRecoverySlice wired; 6/6 failure/recovery/NO-GO probes aligned; zero unexpected mismatches.
target: Add evidence, telemetry and provenance run record for failure/recovery slice probes.
hypothesis: Evidence slice records disposition, criterion and aligned outcomes for all six path probes.
acceptance: Run record validates; telemetry and provenance present; probe matrix validates.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A05
last_commit: (pending)
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (29/29); failure/recovery slice 6/6 aligned; zero unexpected mismatches
evidence: validateResearcherRiskTradeoffFailureRecoveryProbeMatrix + runResearcherRiskTradeoffFailureRecoverySlice; invalid fixture/null-byte guard; recoverResearchRiskTradeoffEvidence; orchestrator validateResearchRiskTradeoff gate
next: P04-B07-A06
