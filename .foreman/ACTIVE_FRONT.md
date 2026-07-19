# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A10
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 418/1000
phase_progress: 16/100
block_progress: 9/10
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

P05-B02-A10 — Filesystem okuma ve grounding: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P05-B02-A09 guard slice sealed; adversarial/perf/cost/safety controls per contract.
target: Seal P05-B02 block gate with regression + guard evidence and Cerrahi edit engine handoff.
hypothesis: Block gate bundles A01–A09 deliverables without regressing integration wiring.
acceptance: Block gate PASS; handoff contract valid; zero unexpected mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/forge-p05-worker-filesystem-grounding.probe.ts
rollback: P05-B02-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A09
last_commit: pending
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts
evidence: runWorkerFilesystemGroundingGuardSlice; validateForgeWorkerFilesystemGroundingGuard; adversarial 3/3 rejected; perf/cost/safety PASS; integration guard wired; 27/27 probes; 61/61 tests
next: P05-B02-A10
