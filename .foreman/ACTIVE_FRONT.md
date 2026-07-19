# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A02
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 430/1000
phase_progress: 26/100
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

P05-B04-A02 — Shell ve process lifecycle: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P05-B04-A01 baseline sealed; define typed shell/process lifecycle contract wired to probe matrix.
target: Worker shell process contract v1 with measurable shell, process and boundary acceptance criteria.
hypothesis: Contract aligns fixture probe matrix, category min counts and documented A01 FAIL gap disposition.
acceptance: Contract versioned; probe ids unique; category minProbeCount satisfied; A01 FAIL gaps mapped to gap disposition.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts
rollback: P05-B04-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B04-A01
last_commit: PENDING
tests: PASS — forge-p05-worker-shell-process-baseline.test.ts (8/8)
evidence: loadWorkerShellProcessBaseline + validateWorkerShellProcessBaseline + runWorkerShellProcessProbes; 27-probe matrix, 5 documented FAIL gaps, sourceBlockGate P05-B03-A10, handoff entry P05-B04-A01
next: P05-B04-A02
