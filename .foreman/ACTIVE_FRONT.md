# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 55/1000
phase_progress: 54/100
block_progress: 6/10
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

P01-B06-A07 — Benchmark ve eval harness: unit, property ve fuzz doğrulamasını ekle.

objective: A06 failure/recovery run record slice üzerine unit/property/fuzz validation slice uygula.
target: runBenchmarkEvalRunRecordFuzzValidation; validateBenchmarkEvalFailureRecoveryRunRecord property cases.
hypothesis: Run record fuzz mutations reject tampered evidence/telemetry/provenance deterministically.
acceptance: run record fuzz test PASS; property validation PASS.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A07 fuzz/property slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A06
last_commit: 367b1ea
tests: PASS — forge-benchmark-eval-harness.test.ts (18/18)
evidence: runBenchmarkEvalFailureRecoverySliceWithRecord; validateBenchmarkEvalFailureRecoveryRunRecord; 9 probes with evidence/telemetry/provenance; sliceAtom P01-B06-A06; harnessVersion 1.0.0-a06
next: P01-B06-A07
