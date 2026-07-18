# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 40/1000
phase_progress: 40/100
block_progress: 9/10
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

P01-B05-A02 — Pipeline invariant engine: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: Pipeline invariant engine için typed contract ile ölçülebilir acceptance kriterini tanımla.
target: Sealed P01-B05-A01 baseline fixture üzerinde invariant contract.
hypothesis: A01 failing baseline sonrası A02 typed contract probe matrix'i kilitleyebilir.
acceptance: contract exists; categories declare invariants; probes align to fixture.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A02 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A01
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A01 baseline (3/3)
evidence: loadPipelineInvariantEngineFixture validates 23 probes aligned to B04 handoff; 7 documented FAIL gaps (runtime invariant engine not wired); runPipelineInvariantEngineProbes measures orchestrator cross-cutting invariants
next: P01-B05-A02
