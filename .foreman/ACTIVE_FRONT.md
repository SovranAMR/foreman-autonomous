# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B05
active_atom: P05-B05-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 443/1000
phase_progress: 39/100
block_progress: 4/10
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

P05-B05-A05 — Git ve worktree transaction: failure, recovery ve NO-GO yollarını uygula.

objective: P05-B05-A04 boundary slice sealed; implement failure, recovery and NO-GO git/worktree paths.
target: Worker git worktree failure/recovery slice closing next measurable gap probes with zero unexpected mismatches.
hypothesis: normalizeGitCommitRequest + boundary baseline enables deterministic failure/recovery validation for remaining NO-GO gaps.
acceptance: Failure/recovery slice loads; next gap probe flips PASS or failure matrix valid; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree-failure-recovery*.test.ts
blast_radius: src/forge-p05-worker-git-worktree.ts, src/orchestrator.ts, src/prompts.ts
rollback: P05-B05-A05 failure/recovery değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Failure/recovery blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B05-A04
last_commit: 7a5f1b4
tests: PASS — forge-p05-worker-git-worktree-boundary.test.ts (5/5), production (5/5), contract (8/8), baseline (8/8)
evidence: normalizeGitCommitRequest + validateWorkerGitWorktreeBoundaryProbeMatrix + runWorkerGitWorktreeBoundarySlice; boundary matrix 7/7 PASS; 4 remaining FAIL gaps
next: P05-B05-A05
