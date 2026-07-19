# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 334/1000
phase_progress: 34/100
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

P04-B04-A05 — Benchmark ve prior-art analizi: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B04-A04 PASS; boundary slice gate closed with zero unexpected mismatches.
target: failure_path + recovery_path + nogo_path probe matrix validation slice.
hypothesis: Failure/recovery slice closes assessBenchmarkPriorArtInputBoundary NO-GO paths with zero mismatches.
acceptance: runResearcherBenchmarkPriorArtFailureRecoverySlice exported; failure/recovery probes align; matrix valid.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A04
last_commit: 82e497f
tests: PASS — forge-p04-researcher-benchmark-prior-art.test.ts (8/8); forge-p04-researcher-benchmark-prior-art-baseline.test.ts (13/13); boundary 6 probes; zero unexpected mismatches; runResearcherBenchmarkPriorArtBoundarySlice
evidence: runResearcherBenchmarkPriorArtBoundarySlice; validateResearcherBenchmarkPriorArtBoundaryProbeMatrix; assessBenchmarkPriorArtInputBoundary topic edge cases PASS
next: P04-B04-A05
