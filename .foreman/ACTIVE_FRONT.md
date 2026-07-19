# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B03-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 419/1000
phase_progress: 17/100
block_progress: 10/10
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

P05-B03-A01 — Cerrahi edit engine: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P05-B02 block gate sealed; B03 handoff contract valid; zero unexpected mismatches on sealed criteria.
target: Measure edit-engine behavior and create failing baseline fixture linked to sealed P05-B02 filesystem grounding block gate.
hypothesis: Existing edit-engine.ts provides measurable surgical edit signals for Forge baseline harness.
acceptance: Baseline fixture loads; probes run with documented FAIL gaps; source block gate refs valid.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts, src/fixtures/forge-worker-edit-engine-v1.json
rollback: P05-B03-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A10
last_commit: 6f179b9
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts
evidence: runWorkerFilesystemGroundingBlockGate; validateForgeWorkerFilesystemGroundingBlockGate; 10/10 atom seals; regression+guard PASS; handoff=PASS→P05-B03; orchestrator worker_filesystem_grounding_block_gate; 70/70 tests
next: P05-B03-A01
