# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B01
active_atom: P04-B01-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 300/1000
phase_progress: 0/100
block_progress: 0/10
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

P04-B01-A01 — Research question decomposition: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-PHASE-GATE PASS; P04 researcher entry baseline.
target: Research question decomposition baseline fixture with failing probe matrix for P04-B01-A01.
hypothesis: Sealed P03 phase gate artifacts enable P04-B01-A01 researcher question baseline.
acceptance: baseline fixture loads; probe matrix defined; handoff from P03-PHASE-GATE valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B01-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-PHASE-GATE
last_commit: 99bc622
tests: PASS — forge-p03-phase-gate.test.ts (6/6); runForgeP03PhaseGate blocks=10/10 atoms=100/100; verifyForgeP03PhaseGate orchestrator wiring
evidence: runForgeP03PhaseGate seals all ten P03 block gates; validateForgeP03StrategistPhaseGateEvidence P04-B01 entry; parser blockDeps fix; handoff=PASS→P04-B01
next: P04-B01-A01
