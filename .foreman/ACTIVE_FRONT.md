# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 5/1000
phase_progress: 5/100
block_progress: 5/10
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

P01-B01-A06 — Evidence, telemetry ve provenance kaydını ekle.

objective: Contract kabul kriterlerine evidence, telemetry ve provenance kaydını ekle.
target: src/forge-baseline-contract.ts, ilgili seam (A06 kapsamında belirlenecek).
hypothesis: Failure/recovery/NO-GO yolları contract+harness'ta; sıradaki dilim evidence/telemetry.
acceptance: Evidence/telemetry davranışı + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili evidence testi.
blast_radius: A06 kapsamında belirlenecek tek seam.
rollback: A06 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: evidence path seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A05
last_commit: (pending)
tests: PASS — forge-baseline-contract (5/5), forge-pipeline-baseline (2/2), 27-probe matrix aligned
evidence: ForgeProbeDisposition typed; 7 new probes (failure/recovery/nogo); state blocked→recover, reviewer NO-GO verdicts, rollback graceful fail, resume corrupt checkpoint
next: P01-B01-A06
