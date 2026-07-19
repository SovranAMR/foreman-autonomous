# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 390/1000
phase_progress: 88/100
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

P04-B10-A01 — Araştırmacı phase gate: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B09-A10 PASS; block gate sealed with B10 handoff contract.
target: Measure researcher phase gate baseline and create failing baseline fixture wired to P04-B09 block gate.
hypothesis: Sealed P04-B09 block gate enables P04-B10-A01 baseline with sourceBlockGate from B09-A10.
acceptance: Baseline fixture loads; documents FAIL gaps; references sealed P04-B09 handoff artifacts.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A10
last_commit: pending
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (65/65); block gate seals=10/10; handoff→P04-B10
evidence: runResearcherResearchToWorkerHandoffBlockGate + validateResearcherResearchToWorkerHandoffBlockHandoffContract + verifyForgeResearcherResearchToWorkerHandoffBlockGate
next: P04-B10-A01
