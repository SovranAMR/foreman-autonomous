# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A07
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 425/1000
phase_progress: 22/100
block_progress: 6/10
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

P05-B03-A07 — Cerrahi edit engine: unit, property ve fuzz doğrulamasını ekle.

objective: P05-B03-A06 evidence slice sealed; add unit, property and fuzz validation.
target: Close property/fuzz slice with probe matrix validation and focused test coverage.
hypothesis: Edit engine property/fuzz probes ship with zero unexpected mismatches.
acceptance: Property/fuzz probe matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A06
last_commit: 02cd2de
tests: PASS — forge-p05-worker-edit-engine-evidence.test.ts (5/5), failure-recovery (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 38 total
evidence: runWorkerEditEngineEvidenceSlice + validateWorkerEditEngineEvidenceProbeMatrix + runWorkerEditEngineProbesWithRecord; 7/7 evidence slice probes aligned with auditable run record
next: P05-B03-A07
