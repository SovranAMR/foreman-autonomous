# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A03
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 221/1000
phase_progress: 22/100
block_progress: 2/10
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

P03-B03-A03 — Atomization ve atom boyutu: en küçük üretim dikey dilimini uygula.

objective: P03-B03-A02 PASS; P03-B03-A03 implement smallest production vertical slice for atomization gaps.
target: assessStrategistAtomizeInputBoundary, recoverStrategistAtomize.
hypothesis: P03-B03-A03 closes documented A01 FAIL gaps via bounded production slice.
acceptance: gap probes flip to PASS; production slice tests green; no regression on contract coverage.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts, src/orchestrator.ts
rollback: P03-B03-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: gap closure blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A02
last_commit: e903757
tests: PASS — forge-p03-strategist-atomization*.test.ts (10/10); contract 23 probes; 4 gap dispositions
evidence: getActiveStrategistAtomizationContract; validateStrategistAtomizationCoverage; validateStrategistAtomizationAgainstContract
next: P03-B03-A03
