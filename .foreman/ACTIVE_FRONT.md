# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 164/1000
phase_progress: 63/100
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

P02-B07-A06 — Alternative vision production slice: evidence, telemetry and provenance record.

objective: P02-B07-A05 failure/recovery slice PASS; evidence next.
target: Add auditable evidence, telemetry and provenance for failure/recovery slice run.
hypothesis: run record validates against contract after A05 failure/recovery gate.
acceptance: forge-p02-visioner-alternative evidence slice PASS (A06 tests when added).
commands: npx tsx --test src/forge-p02-visioner-alternative.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A06 evidence değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: evidence requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A05
last_commit: 46edb16
tests: PASS — forge-p02-visioner-alternative.test.ts (21/21); forge-p02-visioner-alternative-baseline.test.ts (3/3)
evidence: validateVisionerAlternativeFailureRecoveryProbeMatrix + runVisionerAlternativeFailureRecoverySlice; 6/6 failure/recovery/NO-GO probes aligned; 23/23 full matrix preserved
next: P02-B07-A06
