# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 136/1000
phase_progress: 36/100
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

P02-B04-A08 — Repo ve kullanıcı bağlamı grounding: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B04-A07 property/fuzz slice sealed; regression gate next.
target: Wire visioner grounding property/fuzz into Forge regression integration and block gate probe matrix.
hypothesis: A07 structural properties and fuzz gates provide stable substrate for A08 regression detection.
acceptance: regression gate passes; probe alignment preserved; property/fuzz sealed in block gate evidence.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.probe.ts
rollback: P02-B04-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: regression integration requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A07
last_commit: 7ce9940
tests: PASS — forge-p02-visioner-grounding.test.ts (21/21); forge-p02-visioner-grounding-baseline.test.ts (3/3); forge-p02-visioner-grounding.property-fuzz.test.ts (5/5)
evidence: runVisionerGroundingPropertyChecks export; runVisionerGroundingFuzzValidation; runVisionerGroundingRunRecordFuzzValidation; 8/8 structural properties pass; fixture fuzz 72/72 rejected; run record fuzz 8/8 tampered mutations rejected
next: P02-B04-A08
