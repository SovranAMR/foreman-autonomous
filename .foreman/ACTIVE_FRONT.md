# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 400/1000
phase_progress: 0/100
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

P05-B01-A01 — Typed tool interface ve dispatch: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04 phase gate sealed; P05 worker execution phase entry.
target: Measure worker tool dispatch baseline and create failing baseline fixture.
hypothesis: Sealed P04 researcher phase gate artifacts provide stable handoff for P05-B01 baseline.
acceptance: Baseline fixture loads, validates, and documents measurable FAIL gaps.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch*.ts
rollback: P05-B01-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A10
last_commit: pending
tests: PASS — forge-p04-researcher-phase-gate-block-gate.test.ts (6/6); forge-p04-researcher-phase-gate*.test.ts (60/60)
evidence: runResearcherPhaseGateBlockGate + validateForgeP04ResearcherPhaseGateBlockGate + verifyForgeResearcherPhaseGateBlockGate + FORGE_P04_B10_TO_P05_HANDOFF_V1
next: P05-B01-A01
