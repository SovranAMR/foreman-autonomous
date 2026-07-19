# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 82/1000
phase_progress: 81/100
block_progress: 3/10
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

P01-B09-A04 — Orchestrator seam ve modülerleşme: boundary ve edge-case davranışlarını tamamla.

objective: A03 production slice sealed; boundary category probes with zero unexpected mismatches.
target: forge-orchestrator-seam.ts boundary slice; edge probes wired to typed contract.
hypothesis: A03 matrix gate + boundary category contract yeterli A04 boundary slice sağlar.
acceptance: boundary slice executes 3 boundary probes; zero unexpected mismatches; documented FAIL gaps preserved.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A04 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A04 boundary slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A03 production slice invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A03
last_commit: pending
tests: PASS — forge-orchestrator-seam*.test.ts (10/10); 23 probes; gapAligned=7; unexpectedMismatches=0
evidence: runOrchestratorSeamProductionSlice; validateOrchestratorSeamProbeMatrix; passAligned=16 gapAligned=7
next: P01-B09-A04
