# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 88/1000
phase_progress: 87/100
block_progress: 8/10
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

P01-B09-A10 — Orchestrator seam ve modülerleşme: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: A09 guard controls sealed; forge-orchestrator-seam block gate on production slice.
target: runForgeOrchestratorSeamBlockGate + verifyForgeOrchestratorSeamBlockGate wired with sealed B09 evidence.
hypothesis: A09 guard foundation + sealed B09 matrix sufficient for block gate handoff to B10.
acceptance: block gate pass; sealed evidence; handoff to P01-B10 ready.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts src/forge-orchestrator-seam-block-gate.test.ts
blast_radius: forge-orchestrator-seam.ts, forge-orchestrator-seam.probe.ts, orchestrator.ts
rollback: A10 block gate değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A09 guard invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A09
last_commit: 7d1edd6
tests: PASS — forge-orchestrator-seam*.test.ts (37/37); guard adversarial=3/3; perf/cost/safety within controls; verifyForgeOrchestratorSeamGuard wired
evidence: validateForgeOrchestratorSeamGuard + verifyForgeOrchestratorSeamGuard in orchestrator.ts; forge-orchestrator-seam.guard.test.ts
next: P01-B09-A10
