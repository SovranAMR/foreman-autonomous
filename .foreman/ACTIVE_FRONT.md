# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A03
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 402/1000
phase_progress: 2/100
block_progress: 2/10
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

P05-B01-A03 — Typed tool interface ve dispatch: en küçük üretim dikey dilimini uygula.

objective: P05-B01-A02 contract sealed; implement smallest production vertical slice.
target: Wire typed tool dispatch contract probes to production code paths.
hypothesis: Six documented A02 gap probes map to minimal TypedToolCall + validator exports.
acceptance: Gap probes flip PASS with zero unexpected mismatches against contract matrix.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/tools.ts, src/prompts.ts, src/orchestrator.ts, src/forge-p05-worker-tool-dispatch*.ts
rollback: P05-B01-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A02
last_commit: pending
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8)
evidence: FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1 with 27 typed probes (21 PASS, 6 gap) aligned to A01 baseline matrix; validateWorkerToolDispatchAgainstContract + criterion wiring
next: P05-B01-A03
