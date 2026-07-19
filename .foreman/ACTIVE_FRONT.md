# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 381/1000
phase_progress: 80/100
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

P04-B09-A02 — Research-to-worker handoff: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B09-A01 PASS; typed contract for research-to-worker handoff from sealed baseline.
target: Define measurable acceptance criteria with typed contract for research-to-worker handoff.
hypothesis: A01 baseline probe matrix and documented FAIL gaps provide contract wiring for B09-A02.
acceptance: Typed contract v1 loaded; probe criteria wired; fixture↔contract alignment gate passes.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A01
last_commit: pending
tests: PASS — forge-p04-researcher-research-to-worker-handoff-baseline.test.ts (10/10); probes=23; documented FAIL gaps=2 (rtwh.parser_research_handoff_bundle, rtwh.exported_handoff_validator); B08 handoff refs validated
evidence: loadResearcherResearchToWorkerHandoffBaseline + runResearcherResearchToWorkerHandoffProbes + FORGE_P04_B08_TO_B09_HANDOFF_V1
next: P04-B09-A02
