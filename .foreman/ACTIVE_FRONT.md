# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 83/1000
phase_progress: 82/100
block_progress: 4/10
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

P01-B09-A05 — Orchestrator seam ve modülerleşme: failure, recovery ve NO-GO yollarını uygula.

objective: A04 boundary slice sealed; failure/recovery/NO-GO category probes with zero unexpected mismatches.
target: forge-orchestrator-seam.ts failure/recovery slice; edge probes wired to typed contract.
hypothesis: A04 boundary gate + failure/recovery category contract yeterli A05 slice sağlar.
acceptance: failure/recovery slice executes 6 probes; zero unexpected mismatches; documented FAIL gaps preserved.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A05 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A05 failure/recovery slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A04 boundary slice invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A04
last_commit: pending
tests: PASS — forge-orchestrator-seam*.test.ts (13/13); boundary=3; passAligned=3; unexpectedMismatches=0
evidence: runOrchestratorSeamBoundarySlice; validateOrchestratorSeamBoundaryProbeMatrix; B08 sourceEvidenceArtifact ref validated
next: P01-B09-A05
