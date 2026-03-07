/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * hash.h — Fıtrat AI v2 Procedural Connectivity Hash
 *
 * Sinapslar saklanmıyor. hash(pre_id, post_id, seed) ile on-the-fly
 * connectivity ve weight hesaplanır. MurmurHash3 finalization mix kullanılır
 * (hızlı, iyi dağılım, GPU-uyumlu).
 *
 * Mesafe bazlı bağlantı olasılığı: P = exp(-distance / lambda)
 * Weight = hash(pre, post, weight_seed) % 26 → 26 ayrık ağırlık seviyesi
 * (Salk Institute: 4.7 bits/synapse ≈ 26 distinct strengths)
 */

#ifndef FITRAT_HASH_H
#define FITRAT_HASH_H

#include <stdint.h>
#include <math.h>

/* MurmurHash3 32-bit finalizer — hızlı, iyi avalanche, GPU'da çalışır */
static inline uint32_t murmur3_mix(uint32_t h) {
    h ^= h >> 16;
    h *= 0x85EBCA6Bu;
    h ^= h >> 13;
    h *= 0xC2B2AE35u;
    h ^= h >> 16;
    return h;
}

/* İki nöron ID'sinden hash üret */
static inline uint32_t hash_pair(uint32_t a, uint32_t b, uint32_t seed) {
    uint32_t h = seed;
    h ^= a;
    h = murmur3_mix(h);
    h ^= b;
    h = murmur3_mix(h);
    return h;
}

/* Bağlantı var mı? threshold = [0, UINT32_MAX] aralığında olasılık */
static inline int synapse_exists(uint32_t pre, uint32_t post, uint32_t seed,
                                  uint32_t threshold) {
    if (pre == post) return 0;  /* self-connection yok */
    return hash_pair(pre, post, seed) < threshold;
}

/* Sinaptik ağırlık: 26 ayrık seviye → [0, 25] */
static inline uint8_t synapse_weight_discrete(uint32_t pre, uint32_t post,
                                               uint32_t seed) {
    return (uint8_t)(hash_pair(pre, post, seed) % 26u);
}

/* Sinaptik ağırlık float: [0.0, 1.0] aralığında */
static inline float synapse_weight_f(uint32_t pre, uint32_t post,
                                      uint32_t seed) {
    return (float)(hash_pair(pre, post, seed) % 26u) / 25.0f;
}

/* Mesafe bazlı bağlantı olasılık threshold'u hesapla
 * P(connect) = base_prob × exp(-distance / lambda)
 * Döndürdüğü değer: uint32_t threshold for synapse_exists
 */
static inline uint32_t distance_threshold(float distance, float lambda,
                                           float base_prob) {
    float p = base_prob * expf(-distance / lambda);
    if (p <= 0.0f) return 0;
    if (p >= 1.0f) return UINT32_MAX;
    return (uint32_t)(p * (float)UINT32_MAX);
}

/* 3D mesafe hesapla (uint16 koordinatlar) */
static inline float neuron_distance(uint16_t x1, uint16_t y1, uint8_t z1,
                                     uint16_t x2, uint16_t y2, uint8_t z2) {
    float dx = (float)x1 - (float)x2;
    float dy = (float)y1 - (float)y2;
    float dz = (float)z1 - (float)z2;
    return sqrtf(dx*dx + dy*dy + dz*dz);
}

/* Lambda sabitleri (mesafe bozunma) */
#define LAMBDA_LOCAL   5.0f     /* yerel bağlantılar için */
#define LAMBDA_DISTANT 100.0f   /* uzak bağlantılar için */
#define BASE_PROB_LOCAL 0.70f   /* yerel bağlantı olasılığı (v1: %70) */
#define BASE_PROB_DISTANT 0.05f /* uzak bağlantı olasılığı (v1: %5) */

#endif /* FITRAT_HASH_H */
