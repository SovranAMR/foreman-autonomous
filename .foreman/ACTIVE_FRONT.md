# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B01
active_atom: P03-B01-A08
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 206/1000
phase_progress: 6/100
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

P03-B01-A08 — Hedef decomposition: Forge entegrasyonu ile regression testini tamamla.

objective: P03-B01-A07 PASS; P03-B01-A08 strategist intent Forge regression slice.
target: runStrategistIntentForgeRegression, detectStrategistIntentProbeRegression.
hypothesis: P03-B01-A08 wires strategist intent harness into Forge pipeline regression gate.
acceptance: regression slice passes; probe regression detection rejects tampered prior records; baseline suite green.
commands: npx tsx --test src/forge-p03-strategist-intent.test.ts
blast_radius: src/forge-p03-strategist-intent.ts
rollback: P03-B01-A08 Forge regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P03-B01-A07 property/fuzz slice misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B01-A07
last_commit: 6704d7c
tests: PASS — forge-p03-strategist-intent-baseline.test.ts (6/6); forge-p03-strategist-intent.test.ts (23/23); property checks 8/8; contract fuzz 0 accepted; run record fuzz 0 accepted
evidence: runStrategistIntentPropertyChecks; runStrategistIntentFuzzValidation; runStrategistIntentPropertyFuzzSlice
next: P03-B01-A08
