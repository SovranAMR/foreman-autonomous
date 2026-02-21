# Chain 003: Thought & Chain Persistence

## Amaç
Thought ve Chain nesnelerini dosya sisteminde yaratma, okuma, güncelleme.
JSON dosyalar: thoughts/t_xxx.json, chains/chain_xxx.json

## Katman
Worker

## Thought Listesi
1. t_014: ThoughtManager — create(), get(), update(), list()
2. t_015: ChainManager — create(), get(), addThought(), updateStatus()
3. t_016: Validators — reasoning boş mu, worker protocol tam mı
4. t_017: Smoke test

## Bağımlılıklar
- chain_001 (tipler)
- chain_002 (state machine — ThoughtManager state'e referans verecek)

## Kabul Kriteri
- Thought create → JSON dosya oluşur
- Thought get → JSON'dan okur
- Thought update → dosya güncellenir
- Chain create/addThought çalışır
- Validators boş reasoning/incomplete worker protocol reddeder
- Smoke test geçer
