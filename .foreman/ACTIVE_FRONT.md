# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 383/1000
phase_progress: 82/100
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

P04-B09-A04 — Research-to-worker handoff: boundary ve edge-case davranışlarını tamamla.

objective: P04-B09-A03 PASS; production slice closes nogo gaps with zero unexpected mismatches.
target: Complete boundary-category probe matrix for handoff input edge cases.
hypothesis: A03 slice enables A04 boundary gate with contract-wired edge-case probes.
acceptance: Boundary probes align; zero unexpected mismatches in boundary slice.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A03
last_commit: pending
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (21/21); probe matrix 23/23 aligned; unexpectedMismatches=0
evidence: parseResearchToWorkerHandoff + validateResearchToWorkerHandoff + orchestrator wiring + runResearcherResearchToWorkerHandoffProductionSlice
next: P04-B09-A04
