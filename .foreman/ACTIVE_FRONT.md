# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B07
active_atom: P04-B07-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 367/1000
phase_progress: 66/100
block_progress: 7/10
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

P04-B07-A08 — Risk ve trade-off araştırması: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B07-A07 PASS; runResearcherRiskTradeoffPropertyFuzzSlice wired; 8/8 structural properties; contract/run-record fuzz gates reject all mutations.
target: Wire risk trade-off property/fuzz slice into Forge regression gate and probe harness.
hypothesis: Regression gate detects probe alignment drift without loosening property/fuzz mutation rejection.
acceptance: Property/fuzz suite validates; regression gate wired; zero accepted mutations.
commands: npx tsx --test src/forge-p04-researcher-risk-tradeoff*.test.ts
blast_radius: src/forge-p04-researcher-risk-tradeoff*.ts
rollback: P04-B07-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A07
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff*.test.ts (37/37); property/fuzz 8/8 structural; contract fuzz 72/72 rejected; run-record fuzz 5/5 rejected; zero accepted mutations
evidence: runResearcherRiskTradeoffPropertyValidation + runResearcherRiskTradeoffFuzzValidation + runResearcherRiskTradeoffRunRecordFuzzValidation + runResearcherRiskTradeoffPropertyFuzzSlice; harnessVersion 1.0.0-a07
next: P04-B07-A08
