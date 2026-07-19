# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A05
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 433/1000
phase_progress: 29/100
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

P05-B04-A05 — Shell ve process lifecycle: failure, recovery ve NO-GO yollarını uygula.

objective: P05-B04-A04 boundary slice sealed; extend failure/recovery probe matrix and NO-GO wiring.
target: Worker shell process failure/recovery slice with complete NO-GO path coverage wired to contract probes.
hypothesis: Failure/recovery slice closes remaining shell command NO-GO paths without regressing A04 boundary alignment.
acceptance: Failure/recovery probes wired; NO-GO validators exported; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts, src/orchestrator.ts, src/tools.ts
rollback: P05-B04-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A04
last_commit: 02d24d4
tests: PASS — forge-p05-worker-shell-process-boundary.test.ts (6/6), forge-p05-worker-shell-process-production.test.ts (5/5), forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: assessShellTimeoutBoundary + normalizeShellCommandRequest + trimmed command boundary + validateWorkerShellProcessBoundaryProbeMatrix + runWorkerShellProcessBoundarySlice; 7/7 boundary probes aligned
next: P05-B04-A05
