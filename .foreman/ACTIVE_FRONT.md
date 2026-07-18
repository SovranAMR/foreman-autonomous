# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 36/1000
phase_progress: 36/100
block_progress: 5/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B04-A07 — Typed phase/event schema: unit, property ve fuzz doğrulamasını ekle.

objective: Typed phase/event schema için unit, property ve fuzz doğrulamasını ekle.
target: Structural property checks and fuzz mutations reject invalid run records.
hypothesis: A06 run records provide auditable substrate; A07 adds property/fuzz gates.
acceptance: property checks pass; fuzz rejects tampered records; no benchmark leakage.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A07 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A06
last_commit: pending
tests: PASS — forge-phase-event-schema (20/20)
evidence: run record validates; evidence per probe with criterion/disposition; telemetry non-negative; provenance lineage (fixture, contract, sourceFormalStateMachine); failure/recovery slice record sliceAtom=P01-B04-A06 with 9 probes
next: P01-B04-A07
