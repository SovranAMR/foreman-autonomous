# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 363/1000
phase_progress: 63/100
block_progress: 3/10
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

P04-B07-A04 — Risk ve trade-off araştırması: boundary ve edge-case davranışlarını tamamla.

objective: P04-B07-A03 PASS; parseResearchTradeoffs + validateResearchRiskTradeoff wired; 23/23 probes aligned; zero FAIL gaps.
target: Complete boundary and edge-case behavior for risk trade-off input assessment and recovery paths.
hypothesis: Boundary slice validates all six boundary probes with zero unexpected mismatches.
acceptance: Boundary probes pass; edge cases covered; probe matrix validates.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A03
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (20/20); production slice 23/23 aligned; zero FAIL gaps
evidence: parseResearchTradeoffs + validateResearchRiskTradeoff + runResearcherRiskTradeoffProductionSlice; orchestrator wired; TRADEOFFS prompt field
next: P04-B07-A04
