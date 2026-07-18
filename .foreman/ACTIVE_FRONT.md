# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 41/1000
phase_progress: 41/100
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

P01-B05-A03 — Pipeline invariant engine: en küçük üretim dikey dilimini uygula.

objective: Pipeline invariant engine için en küçük üretim dikey dilimini uygula.
target: Sealed P01-B05-A02 typed contract üzerinde production slice.
hypothesis: A02 contract sonrası A03 ilk runtime invariant wiring dilimini kapatabilir.
acceptance: production slice exists; contract aligned; matrix valid; zero unexpected mismatches on PASS probes.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A03 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A02
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A02 contract (9/9)
evidence: FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1 with 23 probes across 8 categories; validatePipelineInvariantEngineFixtureAgainstContract aligns fixture to contract; harness wires probe criteria from contract source of truth; 7 documented gap dispositions preserved
next: P01-B05-A03
