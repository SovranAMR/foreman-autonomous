# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 371/1000
phase_progress: 70/100
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

P04-B08-A02 — Spike ve falsification deneyi: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B08-A01 PASS; baseline loads with 2 documented FAIL gaps; B07 handoff sealed.
target: Typed spike/falsification contract v1 with measurable acceptance criteria aligned to baseline probe matrix.
hypothesis: Contract categories mirror baseline probes and declare invariant + minProbeCount per category.
acceptance: Contract validates; baseline aligns; coverage summary matches 23 probes with 2 expected FAIL.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A01
last_commit: b549dd9
tests: PASS — forge-p04-researcher-spike-falsification-baseline.test.ts (10/10); probe matrix 23/23; documented FAIL gaps=2
evidence: loadResearcherSpikeFalsificationBaseline + validateResearcherSpikeFalsificationBaseline + runResearcherSpikeFalsificationProbes
next: P04-B08-A02
