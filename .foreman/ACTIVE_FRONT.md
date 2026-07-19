# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 389/1000
phase_progress: 87/100
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

P04-B09-A10 — Research-to-worker handoff: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B09-A09 PASS; guard verified with adversarial/perf/cost/safety bounds.
target: Seal P04-B09 block gate evidence and wire handoff to P04-B10 baseline.
hypothesis: A09 guard PASS enables A10 block gate sealing with orchestrator verification event.
acceptance: Block gate passes; sealed evidence recorded; P04-B10 baseline handoff ready.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A09
last_commit: 238af3d
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (58/58); guard adversarial=3/3; perf/cost/safety bounds verified
evidence: validateForgeResearcherResearchToWorkerHandoffGuard + runResearcherResearchToWorkerHandoffAdversarialGuardChecks + verifyForgeResearcherResearchToWorkerHandoffGuard
next: P04-B09-A10
