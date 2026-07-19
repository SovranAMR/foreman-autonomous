# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 222/1000
phase_progress: 23/100
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

P03-B03-A04 — Atomization ve atom boyutu: boundary ve edge-case davranışlarını tamamla.

objective: P03-B03-A03 PASS; P03-B03-A04 complete boundary and edge-case behavior for atomization.
target: assessStrategistAtomizeInputBoundary edge cases, atom cap boundary probes.
hypothesis: P03-B03-A04 extends A03 boundary slice with truncation and full boundary category alignment.
acceptance: boundary probes PASS; production slice tests green; no regression on contract coverage.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts
rollback: P03-B03-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: boundary closure blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A03
last_commit: 27fb418
tests: PASS — forge-p03-strategist-atomization*.test.ts (14/14); contract 23 probes; 0 gap dispositions
evidence: assessStrategistAtomizeInputBoundary; recoverStrategistAtomize; runStrategistAtomizationProductionSlice; validateStrategistAtomizationProbeMatrix
next: P03-B03-A04
