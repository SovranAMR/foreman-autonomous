# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 150/1000
phase_progress: 50/100
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

P02-B06-A02 — Uncertainty ve clarification policy: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B06-A01 baseline sealed; typed contract slice next.
target: Define measurable acceptance criteria with typed contract for uncertainty and clarification policy.
hypothesis: Documented vunc.structured_clarification_recovery FAIL gap provides stable contract entry for B06-A02.
acceptance: contract declares all categories; probe matrix aligned to fixture; zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-uncertainty.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/orchestrator.ts
rollback: P02-B06-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: B06 contract unrelated orchestrator refactor gerektirirse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A01
last_commit: pending
tests: PASS — forge-p02-visioner-uncertainty-baseline.test.ts (3/3)
evidence: baseline fixture v1.0.0 loads; 23 probes; 1 documented FAIL gap (vunc.structured_clarification_recovery); P02-B05 handoff validated
next: P02-B06-A02
