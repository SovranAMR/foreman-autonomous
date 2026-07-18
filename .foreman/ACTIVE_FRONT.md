# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 6/1000
phase_progress: 6/100
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

P01-B01-A07 — Unit, property ve fuzz doğrulamasını ekle.

objective: Contract kabul kriterlerine unit, property ve fuzz doğrulamasını ekle.
target: src/forge-baseline-contract.ts, ilgili seam (A07 kapsamında belirlenecek).
hypothesis: Evidence/telemetry/provenance harness'ta; sıradaki dilim property/fuzz doğrulaması.
acceptance: Property/fuzz davranışı + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili property/fuzz testi.
blast_radius: A07 kapsamında belirlenecek tek seam.
rollback: A07 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: property/fuzz path seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A06
last_commit: 01804fd
tests: PASS — forge-baseline-contract (8/8), forge-pipeline-baseline (3/3), evidence run record 27/27 validated
evidence: ForgeProbeEvidence/Telemetry/Provenance typed; runForgeBaselineProbesWithRecord; validateBaselineRunRecord; git commit in provenance
next: P01-B01-A07
