# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B05
active_atom: P05-B05-A06
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 444/1000
phase_progress: 40/100
block_progress: 5/10
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

P05-B05-A06 — Git ve worktree transaction: evidence, telemetry ve provenance kaydını ekle.

objective: P05-B05-A05 failure/recovery slice sealed; add evidence, telemetry and provenance recording for git/worktree runs.
target: Worker git worktree evidence slice closing next measurable gap probes with zero unexpected mismatches.
hypothesis: validateGitTransaction + failure/recovery baseline enables deterministic evidence validation for remaining worktree_transaction_engine gap.
acceptance: Evidence slice loads; next gap probe flips PASS or failure matrix valid; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree-evidence*.test.ts
blast_radius: src/forge-p05-worker-git-worktree.ts, src/orchestrator.ts
rollback: P05-B05-A06 evidence değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Evidence blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B05-A05
last_commit: c062f21
tests: PASS — forge-p05-worker-git-worktree-failure-recovery.test.ts (5/5), boundary (5/5), production (6/6), contract (8/8), baseline (8/8)
evidence: validateGitTransaction + runWorkerGitWorktreeFailureRecoverySlice + orchestrator pre-git validation + WORKER_SYSTEM git contract; failure/recovery matrix 7/7 PASS; 3 NO-GO gaps closed; 1 remaining FAIL gap (worktree_transaction_engine)
next: P05-B05-A06
