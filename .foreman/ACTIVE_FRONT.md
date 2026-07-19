# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 274/1000
phase_progress: 75/100
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

P03-B08-A06 — Replan ve plan repair: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B08-A05 PASS; P03-B08-A06 implement evidence/telemetry/provenance for replan failure-recovery slice.
target: failure-recovery run record, validateStrategistReplanFailureRecoveryRunRecord, evidence slice.
hypothesis: P03-B08-A06 extends A05 failure-recovery slice with run record and provenance gate.
acceptance: failure-recovery run record validation PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A05
last_commit: c72e6a6
tests: PASS — forge-p03-strategist-replan*.test.ts (20/20); runStrategistReplanFailureRecoverySlice; 8/8 failure-recovery probes aligned
evidence: validateStrategistReplanFailureRecoveryProbeMatrix; runStrategistReplanFailureRecoverySlice; listStrategistReplanFailureRecoveryProbeIds
next: P03-B08-A06
