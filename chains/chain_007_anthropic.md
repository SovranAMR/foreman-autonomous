# Chain 007: Anthropic Provider

## Amaç
Gerçek Claude API çağrısı yapabilen Anthropic provider'ı implement etmek.

## Katman
Worker

## Thought Listesi
1. t_022: Anthropic SDK kurulumu + provider implementasyonu
2. t_023: API key yönetimi (env var)
3. t_024: Smoke test (gerçek API çağrısı)

## Bağımlılıklar
- chain_005 (LLMProvider interface)

## Kabul Kriteri
- Anthropic provider LLMProvider interface'ini implement eder
- ANTHROPIC_API_KEY env var'dan okunur
- Claude modellerine gerçek çağrı yapılabilir
- Token usage doğru raporlanır
