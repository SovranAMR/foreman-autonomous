# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 89/1000
phase_progress: 88/100
block_progress: 9/10
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

P01-B10-A01 — Entegre Forge baseline gate: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: B09 block gate sealed; integrated Forge baseline gate baseline measurement on sealed B09 handoff.
target: forge-integrated-baseline baseline fixture + probe matrix with documented gaps from B09 sealed handoff.
hypothesis: B09 orchestrator seam block gate + sealed artifacts sufficient for B10 baseline fixture.
acceptance: baseline loads; probes measure current integrated gate behavior; failing gaps documented.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/fixtures/
rollback: B10-A01 baseline değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: B09 block gate invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A10
last_commit: e139e43
tests: PASS — forge-orchestrator-seam*.test.ts (43/43); block gate 10/10 seals; handoff→P01-B10; verifyForgeOrchestratorSeamBlockGate wired
evidence: runForgeOrchestratorSeamBlockGate + verifyForgeOrchestratorSeamBlockGate in orchestrator.ts; forge-orchestrator-seam-block-gate.test.ts
next: P01-B10-A01
