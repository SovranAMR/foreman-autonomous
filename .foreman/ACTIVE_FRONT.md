# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A03
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 431/1000
phase_progress: 27/100
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

P05-B04-A03 — Shell ve process lifecycle: en küçük üretim dikey dilimini uygula.

objective: P05-B04-A02 contract sealed; implement smallest production slice wired to contract probe matrix.
target: Worker shell process contract v1 production wiring for gap probes and shell validator export.
hypothesis: Production slice closes at least one measurable gap without breaking A01 baseline alignment.
acceptance: Contract gap probes wired; validateShellCommand exported; targeted tests PASS.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts, src/orchestrator.ts, src/prompts.ts
rollback: P05-B04-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A02
last_commit: PENDING
tests: PASS — forge-p05-worker-shell-process-contract.test.ts (8/8), forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: FORGE_WORKER_SHELL_PROCESS_CONTRACT_V1 + getActiveWorkerShellProcessContract + validateWorkerShellProcessAgainstContract; 27 probes, 5 gap disposition from A01 FAIL gaps, criterion wired in runWorkerShellProcessProbes
next: P05-B04-A03
