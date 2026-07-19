# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B05
active_atom: P05-B05-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 439/1000
phase_progress: 35/100
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

P05-B05-A01 — Git ve worktree transaction: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P05-B04 block gate sealed; begin P05-B05 git/worktree baseline measurement.
target: Worker git worktree transaction baseline with failing fixture against sealed P05-B04 block gate.
hypothesis: Sealed shell process artifacts provide stable entry for git/worktree baseline probes.
acceptance: Baseline fixture loads; failing gaps documented; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree*.test.ts
blast_radius: src/forge-p05-worker-git-worktree.ts, src/fixtures/forge-worker-git-worktree-v1.json
rollback: P05-B05-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A10
last_commit: pending
tests: PASS — forge-p05-worker-shell-process-block-gate.test.ts (9/9), forge-p05-worker-shell-process*.test.ts (69/69 total)
evidence: runWorkerShellProcessBlockGate + validateForgeWorkerShellProcessBlockGate + buildWorkerShellProcessBlockGateEvidence + FORGE_P05_B04_TO_B05_HANDOFF_V1; block gate PASS, handoff→P05-B05 sealed
next: P05-B05-A01
