# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 382/1000
phase_progress: 81/100
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

P04-B09-A03 — Research-to-worker handoff: en küçük üretim dikey dilimini uygula.

objective: P04-B09-A02 PASS; typed contract for research-to-worker handoff from sealed baseline.
target: Implement smallest production vertical slice closing documented nogo gaps.
hypothesis: A02 contract nogo probes (parseResearchToWorkerHandoff, validateResearchToWorkerHandoff) wire via A03 slice.
acceptance: Production slice runs; nogo gaps closed; probe matrix full alignment.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts, src/parser.ts
rollback: P04-B09-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A02
last_commit: pending
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (18/18); contract probes=23; expectedFail=2 (rtwh.parser_research_handoff_bundle, rtwh.exported_handoff_validator); fixture↔contract alignment gate PASS
evidence: FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1 + validateResearcherResearchToWorkerHandoffAgainstContract + criterion wiring
next: P04-B09-A03
