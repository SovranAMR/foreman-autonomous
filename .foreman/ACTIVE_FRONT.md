# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 374/1000
phase_progress: 73/100
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

P04-B08-A05 — Spike ve falsification deneyi: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B08-A04 PASS; failure_path + recovery_path + nogo_path probe matrix wired with zero unexpected mismatches.
target: Failure/recovery/NO-GO category probe matrix for spike falsification guard paths.
hypothesis: Failure slice closes guard-path probes without regressing A04 boundary wiring.
acceptance: Failure/recovery slice tests pass; zero unexpected mismatches on guard-path probes.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A05 failure slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A04
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification.test.ts (14/14); forge-p04-researcher-spike-falsification-baseline.test.ts (15/15); boundary slice 6/6 probes zero mismatches
evidence: validateResearcherSpikeFalsificationBoundaryProbeMatrix + runResearcherSpikeFalsificationBoundarySlice + boundary input edge-case guards
next: P04-B08-A05
