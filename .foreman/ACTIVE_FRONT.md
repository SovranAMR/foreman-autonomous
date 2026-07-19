# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 310/1000
phase_progress: 10/100
block_progress: 0/10
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

P04-B02-A01 — Repo içi kanıt toplama: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B01-A10 PASS; measure in-repo evidence collection behavior and create failing baseline fixture.
target: Baseline fixture, probe matrix, P04-B01 block gate handoff entry contract.
hypothesis: Sealed question decomposition block gate provides stable entry for in-repo evidence baseline.
acceptance: baseline fixture loads; probes wired; handoff from P04-B01 validated; failing gaps documented.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A10
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (57/57); block gate PASS; seals=10/10; handoff→P04-B02
evidence: runResearcherQuestionDecompositionBlockGate; verifyForgeResearcherQuestionDecompositionBlockGate; FORGE_P04_B01_BLOCK_GATE_V1; FORGE_P04_B01_TO_B02_HANDOFF_V1; harnessVersion=1.0.0-a10
next: P04-B02-A01
