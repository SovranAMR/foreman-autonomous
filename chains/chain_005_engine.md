# Chain 005: Engine — Düşünce Motoru

## Amaç
LLM'lere çağrı yapan, düşünce üreten, araştırma yapan ana motoru implement etmek.
Engine = think() + research() + execute()

## Katman
Worker

## Thought Listesi
1. t_019: LLM Provider abstraction — çoklu model çağrısı için arayüz
2. t_020: think() — tek bir düşünce üretme (prompt → LLM → ThinkResult)
3. t_021: research() — web araştırma (query → search → findings)
4. t_022: Prompt templates — her katman için system prompt
5. t_023: Engine sınıfı — hepsini birleştiren orkestratör
6. t_024: Smoke test

## Bağımlılıklar
- chain_001 (tipler)
- chain_002 (state machine)
- chain_003 (thought/chain persistence)
- chain_004 (rate limiter)

## Kabul Kriteri
- LLM provider interface tanımlı (mock ile test edilebilir)
- think() bir thought üretip persist eder
- research() web araştırma yapar (mock ile)
- Prompt'lar katmana göre farklılaşır
- Engine tüm parçaları koordine eder
- Smoke test geçer
