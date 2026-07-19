# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A08
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 276/1000
phase_progress: 76/100
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

P03-B08-A08 — Replan ve plan repair: Forge entegrasyonu ile regression testini tamamla.

objective: P03-B08-A07 PASS; P03-B08-A08 implement Forge regression integration for replan evidence slice.
target: run record regression detection, forge regression harness.
hypothesis: P03-B08-A08 extends A07 property/fuzz with probe alignment regression gates.
acceptance: Forge regression PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A08 Forge regression değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Forge regression blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A07
last_commit: 987bbd1
tests: PASS — forge-p03-strategist-replan*.test.ts (30/30); runStrategistReplanPropertyFuzzSlice; runStrategistReplanFuzzValidation; runStrategistReplanRunRecordFuzzValidation
evidence: runStrategistReplanPropertyFuzzSlice; runStrategistReplanPropertyChecks; runStrategistReplanFuzzValidation; runStrategistReplanRunRecordFuzzValidation
next: P03-B08-A08
