# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 90/1000
phase_progress: 89/100
block_progress: 9/10
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

P01-B10-A02 — Entegre Forge baseline gate: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: B10-A01 baseline fixture sealed; typed integrated gate contract with measurable acceptance criteria.
target: FORGE_INTEGRATED_BASELINE_CONTRACT_V1 + category contracts aligned to 24-probe A01 matrix.
hypothesis: A01 fixture + B09 handoff sufficient to declare typed integrated gate contract.
acceptance: contract covers all categories; probe ids align with fixture; criteria measurable.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts
rollback: B10-A02 contract değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A01 baseline invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A01
last_commit: b5e7084
tests: PASS — forge-integrated-baseline*.test.ts (3/3); 24 probes; 8 documented FAIL gaps; B09 handoff aligned
evidence: forge-integrated-baseline-v1.json, runIntegratedBaselineProbes, validateIntegratedBaseline, SEALED_FORGE_BLOCK_INVENTORY
next: P01-B10-A02
