# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 301/1000
phase_progress: 1/100
block_progress: 1/10
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

P04-B01-A02 — Research question decomposition: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B01-A01 PASS; typed contract for researcher question decomposition.
target: Research question decomposition typed contract with measurable acceptance criteria for P04-B01-A02.
hypothesis: P04-B01-A01 baseline probe matrix enables typed contract coverage gate.
acceptance: contract declares all categories; probes wired; coverage validation passes.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A01
last_commit: 6b9bb9c
tests: PASS — forge-p04-researcher-question-decomposition-baseline.test.ts (5/5); 25 probes / 6 FAIL gaps aligned
evidence: forge-researcher-question-decomposition-v1.json; assessResearchQuestionInputBoundary + assessResearchQuestionDecompositionPresence; P03-PHASE-GATE handoff valid
next: P04-B01-A02
