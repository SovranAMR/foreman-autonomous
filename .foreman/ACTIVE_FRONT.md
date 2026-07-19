# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B01
active_atom: P03-B01-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 204/1000
phase_progress: 4/100
block_progress: 5/10
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

P03-B01-A06 — Hedef decomposition: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B01-A05 PASS; P03-B01-A06 strategist intent evidence/telemetry slice.
target: runStrategistIntentEvidenceSlice, validateStrategistIntentEvidenceRunRecord.
hypothesis: P03-B01-A06 completes contract-wired evidence/telemetry/provenance probes with zero unexpected mismatches.
acceptance: evidence slice probes aligned; run record validation green; baseline regression green.
commands: npx tsx --test src/forge-p03-strategist-intent.test.ts
blast_radius: src/forge-p03-strategist-intent.ts
rollback: P03-B01-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P03-B01-A05 failure/recovery slice misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B01-A05
last_commit: af96616
tests: PASS — forge-p03-strategist-intent-baseline.test.ts (6/6); forge-p03-strategist-intent.test.ts (13/13); failure/recovery slice 6/6 probes; 0 unexpected mismatches
evidence: runStrategistIntentFailureRecoverySlice; validateStrategistIntentFailureRecoveryProbeMatrix; listStrategistIntentFailureRecoveryProbeIds
next: P03-B01-A06
