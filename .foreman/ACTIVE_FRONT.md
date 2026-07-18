# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 27/1000
phase_progress: 26/100
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

P01-B03-A08 — Formal state machine: Forge entegrasyonu ile regression testini tamamla.

objective: Formal state machine Forge entegrasyonu ile regression testini tamamla.
target: Regression gate passes on canonical formal state machine matrix.
hypothesis: A07 property/fuzz gates enable regression integration on FSM artifacts.
acceptance: Regression gate passes; canonical matrix record validates.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A08 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: regression slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A07
last_commit: PENDING
tests: PASS — forge-formal-state-machine (21/21 main + 4/4 property-fuzz)
evidence: runFormalStateMachinePropertyChecks 7/7 PASS; runFormalStateMachineFuzzValidation rejects 24/24 mutations per seed; runFormalStateMachineRunRecordFuzzValidation rejects 3/3 run record mutations; validateFormalStateMachineRunRecord baseline PASS
next: P01-B03-A08
