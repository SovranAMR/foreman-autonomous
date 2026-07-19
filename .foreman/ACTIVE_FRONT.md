# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 99/1000
phase_progress: 100/100
block_progress: 10/10
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

P01 phase gate — P01 tamamlanma doğrulaması: 10 block gate PASS, phase suite ve npm test.

objective: B10-A10 integrated block gate sealed; P01 phase acceptance gate next.
target: P01 phase gate suite + tam npm test.
hypothesis: Ten sealed block gates + integrated baseline block gate sufficient for P01 phase seal.
acceptance: all P01 block gates PASS; phase acceptance checklist green.
commands: npm test
blast_radius: .foreman/phases/P01_FORGE_CONTRACT.md
rollback: B10-A10 block gate slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: block gate fails ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A10
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (83/83); forge-pipeline-regression.integration.test.ts P01-B10-A10 (2/2); validateForgeIntegratedBaselineBlockGate; verifyForgeIntegratedBlockGate orchestrator wiring
evidence: runIntegratedBaselineBlockGate seals=10/10 inventory=9 handoff=PASS→P02-B01; validateForgeIntegratedBaselineBlockGate PASS; verifyForgeIntegratedBlockGate emits integrated_baseline_block_gate verification; ibase.integrated_block_gate_method sealed PASS
next: P01 phase gate
