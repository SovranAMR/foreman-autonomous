# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 43/1000
phase_progress: 43/100
block_progress: 4/10
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

P01-B05-A05 — Pipeline invariant engine: failure, recovery ve NO-GO yollarını uygula.

objective: Pipeline invariant engine failure/recovery kategorisi için NO-GO probe dilimini uygula.
target: Sealed P01-B05-A04 boundary slice üzerinde failure/recovery matrix validation.
hypothesis: A04 boundary gate sonrası A05 failure-recovery slice sıfır unexpected mismatch ile kapanabilir.
acceptance: failure/recovery probes declared; matrix valid; documented FAIL gaps preserved; zero unexpected mismatches.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A05 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A04
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A04 boundary slice (14/14)
evidence: runPipelineInvariantEngineBoundarySlice with validatePipelineInvariantEngineBoundaryProbeMatrix; 3 boundary probes; 2 passAligned + 1 gapAligned; zero unexpected mismatches; inv.invariant_engine_orchestrator_wired gap preserved
next: P01-B05-A05
