# Chain 001: Tip Sistemi

## Amaç
Foreman'ın temel veri yapılarını TypeScript tipleri olarak tanımlamak.

## Katman
Worker (bu chain kod yazıyor)

## Thought Listesi
1. t_001: Layer enum + LayerConfig
2. t_002: ThoughtStatus enum
3. t_003: Thought interface
4. t_004: Chain interface  
5. t_005: SystemState + geçiş kuralları
6. t_006: WorkerProtocol interface
7. t_007: RateLimitConfig interface
8. t_008: Persistence tipleri (ThoughtFile, ChainFile)
9. t_009: Engine tipleri (ThinkRequest, ThinkResult)
10. t_010: Tüm tiplerin tutarlılık kontrolü

## Bağımlılıklar
Yok — bu ilk chain, hiçbir şeye bağımlı değil.

## Kabul Kriteri
- `bun run src/types.ts` hatasız çalışır
- Her tip ARCHITECTURE.md ile tutarlı
- Her tip'in üstünde JSDoc açıklama var
