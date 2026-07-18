# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 33/1000
phase_progress: 32/100
block_progress: 3/10
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

P01-B04-A04 — Typed phase/event schema: boundary ve edge-case davranışlarını tamamla.

objective: Typed phase/event schema için boundary ve edge-case davranışlarını tamamla.
target: Contract-wired boundary probes execute with zero unexpected mismatches.
hypothesis: A03 production slice validates matrix alignment; A04 extends boundary coverage.
acceptance: boundary slice executes; edge probes aligned; documented gaps preserved.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A04 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A03
last_commit: 9361e06
tests: PASS — forge-phase-event-schema (11/11)
evidence: contract-wired production slice; 19 PASS + 5 gap probes aligned; validatePhaseEventSchemaProbeMatrix zero unexpected mismatches; runPhaseEventSchemaProductionSlice gate
next: P01-B04-A04
