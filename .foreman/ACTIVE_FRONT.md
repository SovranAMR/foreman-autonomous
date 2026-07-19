# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 379/1000
phase_progress: 78/100
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

P04-B08-A10 — Spike ve falsification deneyi: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B08-A09 PASS; seal spike falsification block gate with A01–A09 deliverables.
target: Block gate validation, regression, guard, and B09 handoff on canonical spike falsification matrix.
hypothesis: Block gate seals all A01–A09 artifacts and prepares research-to-worker handoff baseline.
acceptance: Block gate PASS; all deliverables validated; handoff baseline ready.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification*.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Block gate blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A09
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification*.test.ts (58/58); guard adversarial=3/3; perf/cost/safety green; orchestrator verifyForgeResearcherSpikeFalsificationGuard
evidence: validateForgeResearcherSpikeFalsificationGuard + verifyForgeResearcherSpikeFalsificationGuard
next: P04-B08-A10
