# Chain 008: Orchestrator Pipeline

## Amaç
Tam pipeline: task → vision → decompose → research per block → atomize → execute per atom → verify → reflect
Tek komutla tüm akışı çalıştıran Orchestrator sınıfı.

## Katman
Worker

## Thought Listesi
1. t_022: Orchestrator sınıfı — run(task) metodu
2. t_023: Vision phase — vizyoner chain oluştur, vizyon dokümanı üret
3. t_024: Decompose phase — stratejist bloklara parçala
4. t_025: Research phase — her blok için araştırma
5. t_026: Execute phase — her atom için worker step
6. t_027: Reflect phase — her 5 atomda geri bakma
7. t_028: BLOCK signal — alt katmandan üst katmana bildirim
8. t_029: CLI entegrasyonu — foreman run tam pipeline çalıştırsın
9. t_030: Smoke test

## Bağımlılıklar
- chain_001..007

## Kabul Kriteri
- foreman run "task" tam pipeline'ı çalıştırır
- Her faz loglanır
- BLOCK durumunda pipeline durur ve rapor eder
- Reflection her 5 atomda çalışır
