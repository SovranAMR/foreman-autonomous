# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B01
active_atom: P03-B01-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 202/1000
phase_progress: 3/100
block_progress: 3/10
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

P03-B01-A04 — Hedef decomposition: boundary ve edge-case davranışlarını tamamla.

objective: P03-B01-A03 PASS; P03-B01-A04 strategist intent boundary slice.
target: assessStrategistVisionInputBoundary edge cases, runStrategistIntentBoundarySlice.
hypothesis: P03-B01-A04 completes contract-wired boundary probes with zero unexpected mismatches.
acceptance: boundary slice probes aligned; contract matrix green; baseline regression green.
commands: npx tsx --test src/forge-p03-strategist-intent.test.ts
blast_radius: src/forge-p03-strategist-intent.ts
rollback: P03-B01-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P03-B01-A03 production slice misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B01-A03
last_commit: 4c2d525
tests: PASS — forge-p03-strategist-intent-baseline.test.ts (6/6); forge-p03-strategist-intent.test.ts (7/7); 23 probes; 0 documented FAIL gaps
evidence: recoverStrategistDecompose; runStrategistIntentProductionSlice; validateStrategistIntentProbeMatrix; gap=sint.structured_decompose_recovery closed
next: P03-B01-A04
