# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 7/1000
phase_progress: 7/100
block_progress: 7/10
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

P01-B01-A08 — Forge entegrasyonu ile regression testini tamamla.

objective: Contract kabul kriterlerine Forge entegrasyonu ile regression testini ekle.
target: src/forge-baseline-harness.ts, orchestrator seam (A08 kapsamında belirlenecek).
hypothesis: Property/fuzz doğrulaması contract seam'de; sıradaki dilim Forge pipeline regression entegrasyonu.
acceptance: Forge regression davranışı + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili Forge entegrasyon testi.
blast_radius: A08 kapsamında belirlenecek tek seam.
rollback: A08 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: entegrasyon path seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A07
last_commit: 35cc357
tests: PASS — forge-baseline-contract (8/8), forge-baseline-contract.property-fuzz (4/4), forge-pipeline-baseline (3/3)
evidence: runContractPropertyChecks (7 structural properties), runContractFuzzValidation (72/72 mutations rejected), runRunRecordFuzzValidation (3/3 corrupted records rejected)
next: P01-B01-A08
