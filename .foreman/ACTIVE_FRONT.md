# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 409/1000
phase_progress: 7/100
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

P05-B02-A01 — Filesystem okuma ve grounding: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P05-B01 block gate sealed with B02 handoff; baseline fixture for filesystem read/grounding.
target: Measure current filesystem read behavior and create failing baseline fixture aligned to P05-B01 handoff.
hypothesis: loadWorkerFilesystemGroundingBaseline returns versioned fixture with documented FAIL gaps from sealed P05-B01 artifacts.
acceptance: Baseline loads, validates against P05-B01 handoff contract refs, and exposes measurable FAIL probes.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts
rollback: P05-B02-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A10
last_commit: b1d981c
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5), forge-p05-worker-tool-dispatch-boundary.test.ts (4/4), forge-p05-worker-tool-dispatch-failure-recovery.test.ts (5/5), forge-p05-worker-tool-dispatch-evidence.test.ts (5/5), forge-p05-worker-tool-dispatch-property-fuzz.test.ts (6/6), forge-p05-worker-tool-dispatch-integration.test.ts (7/7), forge-p05-worker-tool-dispatch.guard.test.ts (9/9), forge-p05-worker-tool-dispatch-block-gate.test.ts (9/9)
evidence: validateForgeWorkerToolDispatchBlockGate + runWorkerToolDispatchBlockGate; 10/10 atom seals PASS, guard/regression evidence wired, P05-B02 handoff contract valid (entry=P05-B02-A01)
next: P05-B02-A01
