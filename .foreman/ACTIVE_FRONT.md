# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 302/1000
phase_progress: 2/100
block_progress: 2/10
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

P04-B01-A03 — Research question decomposition: en küçük üretim dikey dilimini uygula.

objective: P04-B01-A02 PASS; production slice for researcher question decomposition.
target: Minimal production vertical slice implementing measurable question decomposition gaps.
hypothesis: Typed contract from A02 enables targeted decomposeResearchQuestions and orchestrator wiring.
acceptance: production exports wired; gap probes flip to PASS where implemented; targeted tests pass.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts, src/orchestrator.ts, src/prompts.ts, src/parser.ts
rollback: P04-B01-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A02
last_commit: PENDING
tests: PASS — forge-p04-researcher-question-decomposition.test.ts (8/8); contract coverage 25 probes / 6 FAIL gaps documented
evidence: FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1; validateResearcherQuestionDecompositionContractCoverage; fixture↔contract alignment valid
next: P04-B01-A03
