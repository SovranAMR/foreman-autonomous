# Chain 004: Rate Limiter

## Amaç
LLM çağrılarını throttle eden, model rotasyonu yapan ve token bütçesini
takip eden RateLimiter sınıfını implement etmek.

## Katman
Worker

## Thought Listesi
1. t_018: RateLimiter sınıfı — throttle (min delay), burst protection
2. t_019: Model rotasyonu — 429'da otomatik fallback
3. t_020: Token bütçe takibi — per-thought, per-chain, per-session
4. t_021: Smoke test

## Bağımlılıklar
- chain_001 (RateLimitConfig, ModelRotation, TokenBudget tipleri)

## Kabul Kriteri
- min delay between calls enforce edilir
- Burst protection çalışır (max calls per minute)
- 429 gelince model rotate eder
- Token bütçe aşımı "budget_exceeded" hatasıyla durdurur
- Smoke test geçer
