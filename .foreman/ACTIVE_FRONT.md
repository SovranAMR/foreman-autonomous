# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 79/1000
phase_progress: 78/100
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

P01-B09-A01 — Orchestrator seam ve modülerleşme: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: B08 handoff sealed; orchestrator seam baseline fixture with measurable FAIL gaps.
target: orchestrator.ts seam inventory; baseline fixture aligned to sealed B08 evidence artifact handoff.
hypothesis: Sealed B08 evidence artifact schema + orchestrator method inventory yeterli A01 baseline sağlar.
acceptance: versioned baseline fixture loads; probes measure orchestrator seam gaps; B08 handoff refs valid.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A01 suite when present)
blast_radius: forge-orchestrator-seam*.ts, fixtures/
rollback: A01 baseline slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: handoff invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A10
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (40/40); A09 guard 3/3; A10 block gate seals=10/10 handoff→P01-B09
evidence: runEvidenceArtifactBlockGate; FORGE_P01_B08_TO_B09_HANDOFF_V1; verifyForgeEvidenceArtifactBlockGate
next: P01-B09-A01
