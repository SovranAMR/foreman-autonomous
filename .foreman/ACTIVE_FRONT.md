# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A08
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 426/1000
phase_progress: 22/100
block_progress: 7/10
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

P05-B03-A08 — Cerrahi edit engine: Forge entegrasyonu ile regression testini tamamla.

objective: P05-B03-A07 property/fuzz slice sealed; wire Forge integration regression test.
target: Close integration slice with prior/current run record comparison and guard checks.
hypothesis: Edit engine integration slice detects probe regressions and passes full matrix.
acceptance: Integration probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A08 integration slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Integration slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A07
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine-property-fuzz.test.ts (7/7), evidence (5/5), failure-recovery (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 45 total
evidence: runWorkerEditEnginePropertyFuzzSlice + validateWorkerEditEnginePropertyProbeMatrix; 8/8 structural properties pass, 24/24 fixture fuzz rejected, 5/5 run record mutations rejected
next: P05-B03-A08
