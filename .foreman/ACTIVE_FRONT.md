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

P05-B05-A03 — Git ve worktree transaction: en küçük üretim dikey dilimini uygula.

objective: P05-B05-A02 contract sealed; begin smallest production vertical slice for git/worktree gaps.
target: Worker git worktree typed contract production slice closing first measurable A01 baseline gap.
hypothesis: Typed contract gap matrix provides deterministic entry for TypedGitCall or worktree transaction slice.
acceptance: Production slice loads; first gap probe flips PASS; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree-production*.test.ts
blast_radius: src/tools.ts, src/git-engine.ts, src/forge-p05-worker-git-worktree.ts
rollback: P05-B05-A03 production değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Production blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B05-A02
last_commit: PENDING
tests: PASS — forge-p05-worker-git-worktree-contract.test.ts (8/8), forge-p05-worker-git-worktree-baseline.test.ts (8/8)
evidence: getActiveWorkerGitWorktreeContract + validateWorkerGitWorktreeAgainstContract + summarizeWorkerGitWorktreeContractCoverage; 27 probes, 5 gap dispositions aligned to A01 baseline FAIL debt
next: P05-B05-A03
