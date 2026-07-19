# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 303/1000
phase_progress: 3/100
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

P04-B01-A04 — Research question decomposition: boundary ve edge-case davranışlarını tamamla.

objective: P04-B01-A03 PASS; boundary and edge-case behavior for researcher question decomposition.
target: Complete boundary category probes with vision-input-style edge cases for block tasks.
hypothesis: A03 production slice enables targeted boundary hardening without reopening gap probes.
acceptance: boundary probes PASS; edge-case tests pass; zero unexpected matrix mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A03
last_commit: 27eeed0
tests: PASS — forge-p04-researcher-question-decomposition*.test.ts (16/16); 25/25 probes aligned; 0 FAIL gaps
evidence: decomposeResearchQuestions; validateResearchQuestionDecomposition orchestrator wiring; RESEARCH_QUESTIONS prompt+parser; runResearcherQuestionDecompositionProductionSlice matrixValid
next: P04-B01-A04
