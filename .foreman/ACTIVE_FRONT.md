# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 135/1000
phase_progress: 35/100
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

P02-B04-A07 — Repo ve kullanıcı bağlamı grounding: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B04-A06 evidence/telemetry slice sealed; property/fuzz validation next.
target: Add structural property checks and run-record fuzz validation for visioner grounding contract.
hypothesis: A06 auditable run records provide stable substrate for A07 property and fuzz gates.
acceptance: property checks export; run record fuzz rejects tampered records; contract structural invariants pass.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property suite requires new schema dependency ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A06
last_commit: 31ec85c
tests: PASS — forge-p02-visioner-grounding.test.ts (21/21); forge-p02-visioner-grounding-baseline.test.ts (3/3)
evidence: buildVisionerGroundingRunRecord export; validateVisionerGroundingFailureRecoveryRunRecord; runVisionerGroundingFailureRecoverySliceWithRecord; 6/6 failure/recovery slice evidence aligned; full run 23/23 probes with telemetry
next: P02-B04-A07
