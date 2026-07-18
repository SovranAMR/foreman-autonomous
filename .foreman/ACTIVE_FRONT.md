# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 49/1000
phase_progress: 48/100
block_progress: 0/10
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

P01-B06-A01 — Benchmark ve eval harness: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: B05 sealed artifacts üzerine benchmark/eval harness baseline fixture ve probe matrix oluştur.
target: forge-benchmark-eval-harness fixture; orchestrator benchmark probe seam.
hypothesis: B05 block gate handoff ile B06-A01 failing baseline ölçülebilir.
acceptance: benchmark eval harness fixture test PASS; baseline gaps documented.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts, fixtures/
rollback: A01 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A10
last_commit: 7014f3d
tests: PASS — forge-pipeline-invariant-engine-block-gate.test.ts + guard + core (36/36)
evidence: runForgePipelineInvariantEngineBlockGate seals P01-B05; verifyForgePipelineInvariantEngineBlockGate emits pipeline_invariant_engine_block_gate; B06 handoff ready
next: P01-B06-A01
