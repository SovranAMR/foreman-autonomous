# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 106/1000
phase_progress: 6/100
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

P02-B01-A07 — Intent ve görev anlamlandırma: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B01-A06 evidence/telemetry/provenance slice sealed; unit/property/fuzz slice A07 next.
target: visioner intent run record fuzz validation and property-based probe invariants.
hypothesis: run record fuzz gate closes A07 without scope creep beyond documented gaps.
acceptance: failure/recovery run record fuzz validates; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts
rollback: P02-B01-A07 fuzz/property değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: fuzz cannot validate without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A06
last_commit: 578a012
tests: PASS — forge-p02-visioner-intent.test.ts (24/24); failure/recovery run record 6/6; full run record 23/23; harnessVersion=1.0.0-b06
evidence: buildVisionerIntentRunRecord, validateVisionerIntentFailureRecoveryRunRecord, runVisionerIntentFailureRecoverySliceWithRecord, runVisionerIntentProbesWithRecord; structured_intent_recovery gap preserved in evidence
next: P02-B01-A07
