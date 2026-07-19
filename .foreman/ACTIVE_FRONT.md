# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 307/1000
phase_progress: 7/100
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

P04-B01-A08 — Research question decomposition: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B01-A07 PASS; Forge integration regression gate for researcher question decomposition.
target: Wire probe regression detection and orchestrator/pipeline regression gate for question decomposition matrix.
hypothesis: A07 property/fuzz slice stabilizes contract; A08 can add regression gate without reopening probe matrix.
acceptance: regression gate PASS; prior/current run comparison valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A07
last_commit: a142ca3
tests: PASS — forge-p04-researcher*.test.ts (37/37); property 8/8; fuzz 72/72 rejected; run-record fuzz 5/5 rejected; 0 unexpected mismatches
evidence: runResearcherQuestionDecompositionPropertyFuzzSlice; runResearcherQuestionDecompositionPropertyChecks; runResearcherQuestionDecompositionFuzzValidation; runResearcherQuestionDecompositionRunRecordFuzzValidation
next: P04-B01-A08
