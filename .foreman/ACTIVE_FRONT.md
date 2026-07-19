# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 225/1000
phase_progress: 26/100
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

P03-B03-A06 — Atomization ve atom boyutu: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B03-A06 PASS; P03-B03-A07 add unit, property and fuzz validation for atomization probes.
target: property checks, fuzz validation, run-record mutation guards for atomization slice.
hypothesis: P03-B03-A07 extends A06 evidence closure with structural property and fuzz gates.
acceptance: property/fuzz probes PASS; run-record fuzz rejects mutations; no regression on contract coverage.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts
rollback: P03-B03-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: property/fuzz closure blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A06
last_commit: 8fc19b5
tests: PASS — forge-p03-strategist-atomization*.test.ts (24/24); evidence slice 6/6; full run record 24/24
evidence: runStrategistAtomizationEvidenceSlice; runStrategistAtomizationFailureRecoverySliceWithRecord; validateStrategistAtomizationFailureRecoveryRunRecord; satom.structured_atom_recovery; satom.malformed_atomize_guard
next: P03-B03-A07
