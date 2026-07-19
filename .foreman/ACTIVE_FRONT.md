# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 224/1000
phase_progress: 25/100
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

P03-B03-A06 — Atomization ve atom boyutu: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B03-A05 PASS; P03-B03-A06 add evidence, telemetry and provenance recording for atomization probes.
target: failure/recovery run record, telemetry timing, provenance metadata for atomization slice.
hypothesis: P03-B03-A06 extends A05 failure/recovery closure with auditable evidence artifacts.
acceptance: evidence slice probes PASS; failure/recovery with-record helper green; no regression on contract coverage.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts
rollback: P03-B03-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: evidence closure blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A05
last_commit: df98136
tests: PASS — forge-p03-strategist-atomization*.test.ts (20/20); contract 24 probes; failure/recovery slice 6/6 aligned
evidence: runStrategistAtomizationFailureRecoverySlice; validateStrategistAtomizationFailureRecoveryProbeMatrix; satom.malformed_atomize_guard; satom.structured_atom_recovery; satom.orchestrator_zero_atoms_skip
next: P03-B03-A06
