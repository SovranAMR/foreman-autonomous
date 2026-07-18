# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 52/1000
phase_progress: 51/100
block_progress: 3/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B06-A04 — Benchmark ve eval harness: boundary ve edge-case davranışlarını tamamla.

objective: A03 production slice üzerine boundary-category probe matrix slice uygula.
target: runBenchmarkEvalBoundarySlice; zero unexpected PASS mismatches.
hypothesis: Boundary probes contract-wired çalışır; documented FAIL gaps korunur.
acceptance: boundary slice test PASS; boundary matrix validation PASS.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A04 boundary slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A03
last_commit: PENDING
tests: PASS — forge-benchmark-eval-harness.test.ts (10/10)
evidence: runBenchmarkEvalProductionSlice; validateBenchmarkEvalProbeMatrix; 18 passAligned / 8 gapAligned; zero unexpected mismatches
next: P01-B06-A04
