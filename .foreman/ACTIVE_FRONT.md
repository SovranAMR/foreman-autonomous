# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 403/1000
phase_progress: 3/100
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

P05-B01-A04 — Typed tool interface ve dispatch: boundary ve edge-case davranışlarını tamamla.

objective: P05-B01-A03 production slice sealed; complete boundary and edge-case behavior.
target: Extend typed tool dispatch boundary probes with full edge-case coverage.
hypothesis: Boundary category probes map to assessWorkerToolCallInputBoundary + schema edge cases.
acceptance: Boundary slice PASS with zero unexpected mismatches against contract matrix.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B01-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A03
last_commit: pending
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5)
evidence: TypedToolCall + validateWorkerToolCall + orchestrator pre-dispatch + telemetry; 27/27 probes aligned, 6 A02 gaps closed
next: P05-B01-A04
