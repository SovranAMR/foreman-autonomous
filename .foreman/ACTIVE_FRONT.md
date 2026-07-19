# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 432/1000
phase_progress: 28/100
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

P05-B04-A04 — Shell ve process lifecycle: boundary ve edge-case davranışlarını tamamla.

objective: P05-B04-A03 production slice sealed; extend boundary probe matrix and edge-case handling.
target: Worker shell process boundary slice with complete edge-case coverage wired to contract probes.
hypothesis: Boundary slice closes remaining shell command edge cases without regressing A03 alignment.
acceptance: Boundary probes wired; edge-case validators exported; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts, src/orchestrator.ts, src/tools.ts
rollback: P05-B04-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A03
last_commit: 1f453fc
tests: PASS — forge-p05-worker-shell-process-production.test.ts (5/5), forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: validateShellCommand + buildShellProcessTelemetry + TypedBashCall + orchestrator pre-bash validation + WORKER_SYSTEM shell contract + ProcessRegistry thoughtId/layer; 27/27 probes aligned
next: P05-B04-A04
