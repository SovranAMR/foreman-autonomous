# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A02
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 420/1000
phase_progress: 18/100
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

P05-B03-A02 — Cerrahi edit engine: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P05-B03-A01 baseline sealed; typed contract for surgical edit engine acceptance.
target: Define measurable acceptance criteria with typed contract aligned to P05-B03-A01 baseline probes.
hypothesis: getActiveWorkerEditEngineContract returns versioned contract with criterion per probe and FAIL gap mapping.
acceptance: Contract loads, validates against baseline fixture refs, and exposes measurable acceptance probes.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts
rollback: P05-B03-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A01
last_commit: PENDING
tests: PASS — forge-p05-worker-edit-engine-baseline.test.ts (8/8)
evidence: loadWorkerEditEngineBaseline + runWorkerEditEngineProbes; 27 probes, 6 documented FAIL gaps aligned to P05-B02 handoff (entry=P05-B03-A01)
next: P05-B03-A02
