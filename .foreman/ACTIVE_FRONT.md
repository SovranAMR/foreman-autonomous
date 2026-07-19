# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 377/1000
phase_progress: 76/100
block_progress: 7/10
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

P04-B08-A08 — Spike ve falsification deneyi: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B08-A07 PASS; Forge regression gate for spike falsification property/fuzz slice.
target: Orchestrator-integrated regression test covering production slice + property/fuzz + run record.
hypothesis: Forge regression gate passes on canonical spike falsification matrix without probe regressions.
acceptance: Regression test passes; production slice + property/fuzz + record validation green.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification*.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A08 Forge regression değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A07
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification.property-fuzz.test.ts (6/6); property 8/8; contract fuzz 72/72 rejected; run record fuzz 5/5 rejected; slice zero accepted mutations
evidence: runResearcherSpikeFalsificationPropertyFuzzSlice + validateResearcherSpikeFalsificationEvidenceRunRecord tampered record rejection
next: P04-B08-A08
