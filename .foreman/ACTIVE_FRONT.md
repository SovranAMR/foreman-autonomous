# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 26/1000
phase_progress: 25/100
block_progress: 6/10
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

P01-B03-A07 — Formal state machine: unit, property ve fuzz doğrulamasını ekle.

objective: Formal state machine unit, property ve fuzz doğrulamasını ekle.
target: Run record and contract mutations are rejected by property/fuzz validation.
hypothesis: A06 evidence slice enables fuzz/property gates on formal state machine artifacts.
acceptance: Property checks pass; fuzz mutations on run record are rejected.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A07 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: property/fuzz slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A06
last_commit: PENDING
tests: PASS — forge-formal-state-machine (19/19)
evidence: runFormalStateMachineFailureRecoverySliceWithRecord + runFormalStateMachineProbesWithRecord emit evidence with disposition/criterion provenance; validateFormalStateMachineFailureRecoveryRunRecord PASS (6 probes, sliceAtom P01-B03-A06); validateFormalStateMachineRunRecord PASS (28 probes)
next: P01-B03-A07
