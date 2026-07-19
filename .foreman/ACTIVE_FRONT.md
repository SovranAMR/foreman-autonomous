# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 306/1000
phase_progress: 6/100
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

P04-B01-A07 — Research question decomposition: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B01-A06 PASS; unit, property and fuzz validation for researcher question decomposition.
target: Add structural property checks and fuzz inputs for question decomposition contract and probes.
hypothesis: A06 evidence slice enables targeted property/fuzz slice without reopening failure/recovery probes.
acceptance: property/fuzz probes PASS; slice record valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A06
last_commit: 891225f
tests: PASS — forge-p04-researcher-question-decomposition*.test.ts (26/26); evidence slice 7/7 PASS; 0 unexpected mismatches
evidence: validateResearcherQuestionDecompositionEvidenceRunRecord; runResearcherQuestionDecompositionEvidenceSlice; rques.research_block_non_fatal provenance
next: P04-B01-A07
