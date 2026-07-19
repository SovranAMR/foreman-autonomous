# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 304/1000
phase_progress: 4/100
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

P04-B01-A05 — Research question decomposition: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B01-A04 PASS; failure, recovery and NO-GO paths for researcher question decomposition.
target: Wire failure/recovery/NO-GO category probes with orchestrator halt and non-fatal paths.
hypothesis: A04 boundary hardening enables targeted failure/recovery slice without reopening production probes.
acceptance: failure/recovery/nogo probes PASS; slice matrix valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B01-A04
last_commit: pending
tests: PASS — forge-p04-researcher-question-decomposition*.test.ts (19/19); 27/27 probes aligned; boundary slice 6/6 PASS
evidence: validateResearcherQuestionDecompositionBoundaryProbeMatrix; runResearcherQuestionDecompositionBoundarySlice; rques.whitespace_block_boundary; rques.long_block_truncation_boundary
next: P04-B01-A05
