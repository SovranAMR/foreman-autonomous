# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 305/1000
phase_progress: 5/100
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

P04-B01-A06 — Research question decomposition: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B01-A05 PASS; evidence, telemetry and provenance for researcher question decomposition.
target: Record failure/recovery slice runs with auditable probe evidence and provenance lineage.
hypothesis: A05 failure/recovery slice enables targeted evidence/telemetry slice without reopening boundary probes.
acceptance: evidence/telemetry/provenance probes PASS; slice record valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A06 evidence/telemetry slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A05
last_commit: 30a5880
tests: PASS — forge-p04-researcher-question-decomposition*.test.ts (22/22); failure/recovery slice 7/7 PASS; 0 unexpected mismatches
evidence: validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix; runResearcherQuestionDecompositionFailureRecoverySlice; rques.research_block_non_fatal; rques.nogo_empty_question_halt
next: P04-B01-A06
