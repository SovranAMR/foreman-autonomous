# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 34/1000
phase_progress: 33/100
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

P01-B04-A05 — Typed phase/event schema: failure, recovery ve NO-GO yollarını uygula.

objective: Typed phase/event schema için failure, recovery ve NO-GO yollarını uygula.
target: Contract-wired failure/recovery probes execute with zero unexpected mismatches.
hypothesis: A04 boundary slice validates edge probes; A05 extends failure/recovery coverage.
acceptance: failure/recovery slice executes; NO-GO probes aligned; documented gaps preserved.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A05 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A04
last_commit: a4c4d31
tests: PASS — forge-phase-event-schema (14/14)
evidence: boundary slice; 6 boundary probes (5 PASS + 1 documented FAIL gap); validatePhaseEventSchemaBoundaryProbeMatrix zero unexpected mismatches; runPhaseEventSchemaBoundarySlice gate
next: P01-B04-A05
