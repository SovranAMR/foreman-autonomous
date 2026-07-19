# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A05
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 423/1000
phase_progress: 20/100
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

P05-B03-A05 — Cerrahi edit engine: failure, recovery ve NO-GO yollarını tamamla.

objective: P05-B03-A04 boundary slice sealed; complete failure/recovery/NO-GO surgical edit paths.
target: Close remaining failure_path, recovery_path and nogo_path category probes beyond A04 boundary wiring.
hypothesis: Invalid edit inputs, recovery coercion and orchestrator NO-GO gates ship with focused tests.
acceptance: Failure/recovery probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts, src/tools.ts
rollback: P05-B03-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A04
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine-boundary.test.ts (7/7), production (5/5), baseline (8/8), contract (8/8) — 28 total
evidence: assessEditPathBoundary + assessEditOccurrenceBoundary + normalizeEditRequestPath + runWorkerEditEngineBoundarySlice; 7/7 boundary probes aligned
next: P05-B03-A05
