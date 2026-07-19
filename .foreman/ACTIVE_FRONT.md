# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 401/1000
phase_progress: 1/100
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

P05-B01-A02 — Typed tool interface ve dispatch: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P05-B01-A01 baseline sealed; define typed contract acceptance criteria.
target: Define measurable acceptance criteria with typed contract for worker tool dispatch.
hypothesis: Documented A01 FAIL gaps map to contract probes for A02 typed acceptance.
acceptance: Contract loads, validates, and aligns with baseline probe matrix.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch*.ts
rollback: P05-B01-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A01
last_commit: pending
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8)
evidence: loadWorkerToolDispatchBaseline + validateWorkerToolDispatchBaseline + runWorkerToolDispatchProbes + 6 documented FAIL gaps aligned
next: P05-B01-A02
