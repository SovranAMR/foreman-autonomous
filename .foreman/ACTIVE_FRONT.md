# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A05
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 404/1000
phase_progress: 4/100
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

P05-B01-A05 — Typed tool interface ve dispatch: failure, recovery ve NO-GO yollarını uygula.

objective: P05-B01-A04 boundary slice sealed; implement failure, recovery and NO-GO paths.
target: Extend typed tool dispatch with failure/recovery/NO-GO slice gate.
hypothesis: failure_path + recovery_path + nogo_path probes map to validateWorkerToolDispatchFailureRecoveryProbeMatrix.
acceptance: Failure/recovery slice PASS with zero unexpected mismatches against contract matrix.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B01-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A04
last_commit: pending
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5), forge-p05-worker-tool-dispatch-boundary.test.ts (4/4)
evidence: validateWorkerToolDispatchBoundaryProbeMatrix + runWorkerToolDispatchBoundarySlice; boundary edge cases (trim, nested null-byte, exact max-length, schema gate) with 7/7 boundary probes aligned
next: P05-B01-A05
