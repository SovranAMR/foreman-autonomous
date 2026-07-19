# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A06
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 424/1000
phase_progress: 21/100
block_progress: 5/10
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

P05-B03-A06 — Cerrahi edit engine: evidence, telemetry ve provenance kaydını ekle.

objective: P05-B03-A05 failure/recovery slice sealed; add evidence, telemetry and provenance recording.
target: Close evidence slice with run record, telemetry exports and A06 probe matrix validation.
hypothesis: Failure/recovery run records and edit telemetry provenance ship with focused tests.
acceptance: Evidence probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A05
last_commit: 78ca23c
tests: PASS — forge-p05-worker-edit-engine-failure-recovery.test.ts (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 33 total
evidence: runWorkerEditEngineFailureRecoverySlice + validateWorkerEditEngineFailureRecoveryProbeMatrix + WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES; 7/7 failure/recovery/NO-GO probes aligned
next: P05-B03-A06
