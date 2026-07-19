# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 384/1000
phase_progress: 83/100
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

P04-B09-A05 — Research-to-worker handoff: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B09-A04 PASS; boundary slice closes edge-case gaps with zero unexpected mismatches.
target: Complete failure/recovery/NO-GO category probe matrix for handoff guard paths.
hypothesis: A04 boundary slice enables A05 failure-recovery gate with contract-wired probes.
acceptance: Failure/recovery/NO-GO probes align; zero unexpected mismatches in slice.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A05 failure-recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Failure-recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A04
last_commit: pending
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (29/29); boundary slice 6/6 aligned; unexpectedMismatches=0
evidence: validateResearcherResearchToWorkerHandoffBoundaryProbeMatrix + runResearcherResearchToWorkerHandoffBoundarySlice + handoff input edge-case probes
next: P04-B09-A05
