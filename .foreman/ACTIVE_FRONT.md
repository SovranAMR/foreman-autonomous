# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B05
active_atom: P05-B05-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 442/1000
phase_progress: 38/100
block_progress: 3/10
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

P05-B05-A04 — Git ve worktree transaction: boundary ve edge-case davranışlarını tamamla.

objective: P05-B05-A03 production slice sealed; complete boundary and edge-case git/worktree behavior.
target: Worker git worktree boundary slice closing next measurable gap probes with zero unexpected mismatches.
hypothesis: TypedGitCall baseline enables deterministic boundary validation for remaining worktree transaction gaps.
acceptance: Boundary slice loads; next gap probe flips PASS or boundary matrix valid; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-git-worktree-boundary*.test.ts
blast_radius: src/tools.ts, src/git-engine.ts, src/forge-p05-worker-git-worktree.ts
rollback: P05-B05-A04 boundary değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Boundary blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B05-A03
last_commit: c4431d3
tests: PASS — forge-p05-worker-git-worktree-production.test.ts (5/5), contract (8/8), baseline (8/8)
evidence: TypedGitCall union + validateGitCall + buildGitWorktreeTelemetry + runWorkerGitWorktreeProductionSlice; wgt.typed_git_call_union PASS; 4 remaining FAIL gaps
next: P05-B05-A04
