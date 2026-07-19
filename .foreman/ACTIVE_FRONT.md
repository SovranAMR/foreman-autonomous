# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 275/1000
phase_progress: 76/100
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

P03-B08-A07 — Replan ve plan repair: property ve fuzz validation ekle.

objective: P03-B08-A06 PASS; P03-B08-A07 implement property/fuzz validation for replan evidence slice.
target: run record fuzz validation, structural property checks.
hypothesis: P03-B08-A07 extends A06 run record with fuzz mutation gates.
acceptance: property/fuzz validation PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Property/fuzz blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A06
last_commit: pending
tests: PASS — forge-p03-strategist-replan*.test.ts (24/24); runStrategistReplanEvidenceSlice; validateStrategistReplanFailureRecoveryRunRecord
evidence: runStrategistReplanFailureRecoverySliceWithRecord; validateStrategistReplanFailureRecoveryRunRecord; runStrategistReplanEvidenceSlice
next: P03-B08-A07
