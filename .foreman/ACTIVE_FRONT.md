# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 32/1000
phase_progress: 31/100
block_progress: 2/10
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

P01-B04-A03 — Typed phase/event schema: en küçük üretim dikey dilimini uygula.

objective: Typed phase/event schema için en küçük üretim dikey dilimini uygula.
target: Contract-wired probe execution with zero unexpected mismatches on PASS probes.
hypothesis: A02 typed contract defines the acceptance surface; A03 wires live probes to contract criteria.
acceptance: production slice executes; PASS probes aligned; gap probes documented.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A03 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A02
last_commit: efbf9fe
tests: PASS — forge-phase-event-schema (9/9)
evidence: 24-probe typed contract v1 across 7 categories; fixture↔contract mapping validated; 5 gap dispositions (phase typing, registry, pairing) declared with measurable criteria
next: P01-B04-A03
