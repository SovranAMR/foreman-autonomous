# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 134/1000
phase_progress: 34/100
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

P02-B04-A06 — Repo ve kullanıcı bağlamı grounding: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B04-A05 failure/recovery slice sealed; evidence/telemetry slice next.
target: Wire run record with evidence, telemetry and provenance for grounding probe execution.
hypothesis: A05 failure/recovery baseline provides stable gate for A06 auditable run records.
acceptance: run record builders export; failure/recovery slice record validates; probe evidence aligned.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: run record requires new schema dependency ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A05
last_commit: f0b107e
tests: PASS — forge-p02-visioner-grounding.test.ts (18/18); forge-p02-visioner-grounding-baseline.test.ts (3/3)
evidence: validateVisionerGroundingFailureRecoveryProbeMatrix export; runVisionerGroundingFailureRecoverySlice; 6/6 failure/recovery/NO-GO probes aligned; zero unexpected mismatches
next: P02-B04-A06
