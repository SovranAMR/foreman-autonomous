# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B05
active_atom: P05-B05-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 440/1000
phase_progress: 36/100
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

P05-B05-A02 — Git ve worktree transaction: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P05-B05-A01 baseline sealed; begin typed git/worktree contract definition.
target: Worker git worktree typed contract with measurable acceptance criteria against A01 baseline gaps.
hypothesis: Documented FAIL gaps from A01 provide stable contract entry for git/worktree transaction probes.
acceptance: Contract loads; probe matrix aligned to baseline; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree-contract*.test.ts
blast_radius: src/forge-p05-worker-git-worktree.ts
rollback: P05-B05-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B05-A01
last_commit: 6b76f70
tests: PASS — forge-p05-worker-git-worktree-baseline.test.ts (8/8)
evidence: loadWorkerGitWorktreeBaseline + validateWorkerGitWorktreeBaseline + runWorkerGitWorktreeProbes + assessGitBranchInputBoundary + recoverGitCommitRequest; 27 probes, 5 documented FAIL gaps (typed git union, worktree transaction engine, worker prompt contract, orchestrator pre-git validation, exported git validator)
next: P05-B05-A02
