# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 31/1000
phase_progress: 30/100
block_progress: 1/10
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

P01-B04-A02 — Typed phase/event schema: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: Typed phase/event schema için typed contract ile ölçülebilir acceptance kriterlerini tanımla.
target: Typed contract with measurable acceptance criteria aligned to A01 baseline probes.
hypothesis: A01 baseline FAIL gaps (phase typing, registry, pairing) define the acceptance surface for A02 contract hardening.
acceptance: typed contract probes declared; fixture ↔ contract mapping validated.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A02 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: contract tanımlanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A01
last_commit: 762d68c
tests: PASS — forge-phase-event-schema (4/4)
evidence: 24-probe baseline fixture with 5 documented FAIL gaps (phase typing, unregistered literals, verify phase_start, recovery_assess pairing); B03 handoff link validated
next: P01-B04-A02
