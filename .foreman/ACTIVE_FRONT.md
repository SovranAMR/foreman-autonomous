# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 69/1000
phase_progress: 68/100
block_progress: 0/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-19

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

P01-B08-A01 — Evidence ve artifact şeması: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: B07 block gate PASS; B08 baseline fixture ile evidence/artifact şemasını ölç.
target: forge-evidence-artifact schema baseline; failing baseline fixture.
hypothesis: Sealed B07 reproducible fixture handoff B08-A01 entry için yeterli.
acceptance: baseline fixture oluşturulur; B07 handoff entryCriteria karşılanır.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A01 suite)
blast_radius: forge-evidence-artifact*.ts; src/fixtures/
rollback: A01 baseline slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A10
last_commit: pending
tests: PASS — forge-reproducible-fixture-block-gate.test.ts (6/6); forge-reproducible-fixture-baseline.test.ts (27/27); forge-reproducible-fixture.guard.test.ts (8/8); forge-pipeline-regression.integration.test.ts
evidence: runReproducibleFixtureBlockGate; FORGE_P01_B07_TO_B08_HANDOFF_V1; verifyForgeReproducibleFixtureBlockGate orchestrator seam; 10/10 atom B07 sealed
next: P01-B08-A01
