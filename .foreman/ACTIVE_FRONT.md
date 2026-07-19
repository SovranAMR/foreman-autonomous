# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 422/1000
phase_progress: 19/100
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

P05-B03-A04 — Cerrahi edit engine: boundary ve edge-case davranışlarını tamamla.

objective: P05-B03-A03 production slice sealed; complete boundary and edge-case surgical edit behaviors.
target: Close remaining boundary-category probes and edge cases beyond A03 minimal wiring.
hypothesis: Edit input boundaries, occurrence dispatch edge cases and validator paths ship with focused tests.
acceptance: Boundary probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts, src/tools.ts
rollback: P05-B03-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A03
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine-production.test.ts (5/5), baseline (8/8), contract (8/8) — 21 total
evidence: TypedEditCall + validateSurgicalEdit + buildEditEngineTelemetry + orchestrator pre-edit validation + occurrence dispatch; 6 A02 gap probes closed, 27/27 aligned
next: P05-B03-A04
