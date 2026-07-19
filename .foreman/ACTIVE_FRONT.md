# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 105/1000
phase_progress: 5/100
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

P02-B01-A06 — Intent ve görev anlamlandırma: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B01-A05 failure/recovery slice sealed; evidence/telemetry/provenance slice A06 next.
target: visioner intent run record with probe evidence, telemetry and provenance for failure/recovery categories.
hypothesis: run record bundling closes A06 gate without scope creep beyond documented gaps.
acceptance: failure/recovery run record validates; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts
rollback: P02-B01-A06 evidence/telemetry değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: run record cannot validate without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A05
last_commit: b58060f
tests: PASS — forge-p02-visioner-intent.test.ts (21/21); failure/recovery slice 6/6 PASS; passAligned=5 gapAligned=1; matrixValidation unexpectedMismatches=0
evidence: validateVisionerIntentFailureRecoveryProbeMatrix, runVisionerIntentFailureRecoverySlice, listVisionerIntentFailureRecoveryProbeIds; structured_intent_recovery gap preserved
next: P02-B01-A06
