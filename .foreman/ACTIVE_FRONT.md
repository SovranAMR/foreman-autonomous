# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 37/1000
phase_progress: 37/100
block_progress: 6/10
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

P01-B04-A08 — Typed phase/event schema: Forge entegrasyonu ile regression testini tamamla.

objective: Typed phase/event schema için Forge entegrasyonu ile regression testini tamamla.
target: Regression gate detects probe alignment regressions on canonical phase/event schema matrix.
hypothesis: A07 property/fuzz gates reject tampered records; A08 wires regression into Forge integration.
acceptance: regression gate passes; no probe alignment regression; guard controls integrated.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A08 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A07
last_commit: pending
tests: PASS — forge-phase-event-schema (26/26)
evidence: 7 structural property checks pass; fixture fuzz rejects 24/24 mutations per seed (42,99,20260718); run record fuzz rejects drop_evidence/drop_telemetry/wrong_total; no benchmark leakage
next: P01-B04-A08
