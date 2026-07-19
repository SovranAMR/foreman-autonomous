# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B03
active_atom: P05-B03-A03
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 421/1000
phase_progress: 19/100
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

P05-B03-A03 — Cerrahi edit engine: en küçük üretim dikey dilimini uygula.

objective: P05-B03-A02 contract sealed; smallest production vertical slice for surgical edit engine.
target: Close documented FAIL gaps from typed contract via minimal production wiring.
hypothesis: TypedEditCall union, worker prompt contract, occurrence dispatch and edit validators ship in focused slice.
acceptance: Contract gap probes flip PASS; baseline matrix aligned; targeted tests green.
commands: npx tsx --test src/forge-p05-worker-edit-engine*.test.ts
blast_radius: src/forge-p05-worker-edit-engine.ts, src/tools.ts, src/prompts.ts
rollback: P05-B03-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A02
last_commit: pending
tests: PASS — forge-p05-worker-edit-engine-contract.test.ts (8/8), forge-p05-worker-edit-engine-baseline.test.ts (8/8)
evidence: getActiveWorkerEditEngineContract + validateWorkerEditEngineAgainstContract; 27 probes, 6 gap dispositions mapped to A01 FAIL debt
next: P05-B03-A03
