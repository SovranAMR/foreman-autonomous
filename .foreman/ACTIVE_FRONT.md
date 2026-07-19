# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 80/1000
phase_progress: 79/100
block_progress: 1/10
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

P01-B09-A02 — Orchestrator seam ve modülerleşme: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: A01 baseline sealed; typed orchestrator seam contract with measurable acceptance criteria.
target: forge-orchestrator-seam.ts contract slice; probe matrix aligned to A01 baseline fixture.
hypothesis: A01 probe inventory + category invariants yeterli A02 typed contract sağlar.
acceptance: contract covers 9 categories; 23 probes mapped; disposition + criterion per probe.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A02 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A02 contract slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A01 baseline invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A01
last_commit: pending
tests: PASS — forge-orchestrator-seam*.test.ts (3/3); 23 probes 16 PASS / 7 FAIL gaps aligned; B08 handoff valid
evidence: runOrchestratorSeamProbes; forge-orchestrator-seam-v1.json; validateOrchestratorSeamBaseline
next: P01-B09-A02
