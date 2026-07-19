# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 81/1000
phase_progress: 80/100
block_progress: 2/10
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

P01-B09-A03 — Orchestrator seam ve modülerleşme: en küçük üretim dikey dilimini uygula.

objective: A02 contract sealed; smallest production vertical slice for orchestrator seam modularization.
target: forge-orchestrator-seam.ts production slice; probe matrix wired to typed contract.
hypothesis: A02 typed contract + A01 baseline probes yeterli A03 production slice sağlar.
acceptance: production slice executes 23 probes; zero unexpected mismatches; gapAligned=7.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A03 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A03 production slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A02 contract invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A02
last_commit: pending
tests: PASS — forge-orchestrator-seam*.test.ts (9/9); 23 probes mapped; 9 categories; disposition+criterion per probe
evidence: getActiveOrchestratorSeamContract; validateOrchestratorSeamBaselineAgainstContract; runOrchestratorSeamProbes criterion wiring
next: P01-B09-A03
