# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 39/1000
phase_progress: 39/100
block_progress: 8/10
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

P01-B05-A01 — Pipeline invariant engine: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: Pipeline invariant engine için mevcut orchestrator invariant davranışını ölç ve failing baseline fixture oluştur.
target: Sealed P01-B04 phase/event schema artifacts üzerinde invariant baseline fixture.
hypothesis: B04 handoff sonrası invariant engine A01 failing baseline ile başlayabilir.
acceptance: fixture exists; probes declare measurable gaps; aligns to B04 sealed contract.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A01 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A10
last_commit: pending
tests: PASS — forge-phase-event-schema block gate (6/6)
evidence: runForgePhaseEventSchemaBlockGate seals 10/10 atom checks; FORGE_P01_B04_TO_B05_HANDOFF_V1 targets P01-B05-A01; orchestrator verifyForgePhaseEventSchemaBlockGate emits phase_event_schema_block_gate verification
next: P01-B05-A01
