# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 364/1000
phase_progress: 64/100
block_progress: 4/10
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

P04-B07-A05 — Risk ve trade-off araştırması: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B07-A04 PASS; runResearcherRiskTradeoffBoundarySlice wired; 6/6 boundary probes aligned; zero unexpected mismatches.
target: Implement failure, recovery and NO-GO paths for risk trade-off input assessment and orchestrator gate wiring.
hypothesis: Failure/recovery slice validates all six path probes with zero unexpected mismatches.
acceptance: Failure/recovery probes pass; NO-GO paths covered; probe matrix validates.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A04
last_commit: ee98f17
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (25/25); boundary slice 6/6 aligned; zero unexpected mismatches
evidence: validateResearcherRiskTradeoffBoundaryProbeMatrix + runResearcherRiskTradeoffBoundarySlice; edge-case rejection for validate/recover; exact max-length boundary
next: P04-B07-A05
