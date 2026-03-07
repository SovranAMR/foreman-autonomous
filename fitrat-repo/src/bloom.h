/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * bloom.h — Bloom Filter for Override Table
 *
 * Plastik sinaps değişimlerini (STDP override) takip eder.
 * NVMe'deki override table'a gitmeden önce Bloom filter'ı kontrol et:
 *   - "Kesinlikle yok" → hash'ten hesapla (sıfır I/O)
 *   - "Belki var" → NVMe'den fetch et
 *
 * %99 sinaps hiç değişmez → %99 "kesinlikle yok" → NVMe I/O %99 azalır.
 *
 * Boyut: 1 GB = 8 milyar bit, 4 hash fonksiyonu
 * False positive rate: ~%0.05 (1M insert'te)
 */

#ifndef FITRAT_BLOOM_H
#define FITRAT_BLOOM_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* Bloom filter boyutu: 1 GB = 2^30 bytes = 2^33 bits */
#define BLOOM_SIZE_BYTES  (1u << 30)   /* 1 GB */
#define BLOOM_SIZE_BITS   ((uint64_t)BLOOM_SIZE_BYTES * 8)
#define BLOOM_NUM_HASHES  4

typedef struct {
    uint8_t *bits;
    uint64_t size_bits;
    uint64_t insert_count;
} BloomFilter;

/* MurmurHash3 finalizer (aynı hash.h'deki) */
static inline uint32_t bloom_mix(uint32_t h) {
    h ^= h >> 16;
    h *= 0x85EBCA6Bu;
    h ^= h >> 13;
    h *= 0xC2B2AE35u;
    h ^= h >> 16;
    return h;
}

/* 4 bağımsız hash pozisyonu üret */
static inline void bloom_hashes(uint32_t pre, uint32_t post,
                                 uint64_t out[BLOOM_NUM_HASHES]) {
    uint32_t h1 = bloom_mix(pre ^ 0xDEADBEEF) ^ bloom_mix(post);
    uint32_t h2 = bloom_mix(pre ^ 0xCAFEBABE) ^ bloom_mix(post ^ 0x12345678);
    /* Kirschner-Mitzenmacher: h_i = h1 + i*h2 */
    for (int i = 0; i < BLOOM_NUM_HASHES; i++) {
        out[i] = ((uint64_t)h1 + (uint64_t)i * (uint64_t)h2) % BLOOM_SIZE_BITS;
    }
}

/* === API === */

/* Bloom filter oluştur (1 GB malloc) */
static inline BloomFilter *bloom_create(void) {
    BloomFilter *bf = (BloomFilter *)calloc(1, sizeof(BloomFilter));
    if (!bf) return NULL;
    bf->bits = (uint8_t *)calloc(BLOOM_SIZE_BYTES, 1);
    if (!bf->bits) { free(bf); return NULL; }
    bf->size_bits = BLOOM_SIZE_BITS;
    bf->insert_count = 0;
    return bf;
}

/* Bloom filter yok et */
static inline void bloom_destroy(BloomFilter *bf) {
    if (!bf) return;
    free(bf->bits);
    free(bf);
}

/* Sinaps çiftini ekle (STDP override yazıldığında) */
static inline void bloom_insert(BloomFilter *bf, uint32_t pre, uint32_t post) {
    uint64_t positions[BLOOM_NUM_HASHES];
    bloom_hashes(pre, post, positions);
    for (int i = 0; i < BLOOM_NUM_HASHES; i++) {
        uint64_t byte_idx = positions[i] / 8;
        uint8_t  bit_mask = (uint8_t)(1u << (positions[i] % 8));
        bf->bits[byte_idx] |= bit_mask;
    }
    bf->insert_count++;
}

/* Sinaps çiftini kontrol et
 * Return: 0 = kesinlikle yok (hash'ten hesapla)
 *         1 = belki var (NVMe'den fetch et) */
static inline int bloom_maybe_exists(const BloomFilter *bf,
                                      uint32_t pre, uint32_t post) {
    uint64_t positions[BLOOM_NUM_HASHES];
    bloom_hashes(pre, post, positions);
    for (int i = 0; i < BLOOM_NUM_HASHES; i++) {
        uint64_t byte_idx = positions[i] / 8;
        uint8_t  bit_mask = (uint8_t)(1u << (positions[i] % 8));
        if (!(bf->bits[byte_idx] & bit_mask)) return 0;  /* kesinlikle yok */
    }
    return 1;  /* belki var */
}

/* False positive rate tahmini:
 * FPR ≈ (1 - e^(-k*n/m))^k
 * k=4, m=8G bits, n=insert_count */
static inline double bloom_fpr_estimate(const BloomFilter *bf) {
    double k = BLOOM_NUM_HASHES;
    double n = (double)bf->insert_count;
    double m = (double)bf->size_bits;
    double exp_val = 1.0 - (1.0 / m);
    double p = 1.0;
    for (int i = 0; i < (int)(k * n); i++) {
        p *= exp_val;
        if (p < 1e-300) return 1.0;  /* underflow guard */
    }
    double fpr = 1.0;
    for (int i = 0; i < (int)k; i++) {
        fpr *= (1.0 - p);
    }
    return fpr;
}

/* İstatistik yazdır */
static inline void bloom_print_stats(const BloomFilter *bf) {
    if (!bf) return;
    /* Bit count (sample-based estimate) */
    uint64_t set_bits = 0;
    uint64_t sample_bytes = BLOOM_SIZE_BYTES < 100000 ? BLOOM_SIZE_BYTES : 100000;
    for (uint64_t i = 0; i < sample_bytes; i++) {
        uint8_t b = bf->bits[i];
        while (b) { set_bits += b & 1; b >>= 1; }
    }
    double fill_rate = (double)set_bits / (double)(sample_bytes * 8);
    /* Use builtin formula for FPR */
    double fpr = 1.0;
    for (int i = 0; i < BLOOM_NUM_HASHES; i++) fpr *= fill_rate;

    fprintf(stdout, "Bloom: inserts=%lu, fill=%.4f%%, FPR≈%.6f%%
",
            (unsigned long)bf->insert_count, fill_rate * 100.0, fpr * 100.0);
}

#endif /* FITRAT_BLOOM_H */
