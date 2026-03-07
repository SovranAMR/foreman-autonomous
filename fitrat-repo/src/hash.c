/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * hash.c — Hash tabanlı connectivity yardımcı fonksiyonları
 *
 * Ağırlıklı olarak inline fonksiyonlar hash.h'de. Burada sadece
 * test ve doğrulama için kullanılan non-inline versiyonlar var.
 */

#include "hash.h"
#include <stdio.h>

/* Hash kalitesini doğrula — dağılım testi */
void hash_distribution_test(uint32_t seed, uint32_t n_samples) {
    uint32_t buckets[26] = {0};
    for (uint32_t i = 0; i < n_samples; i++) {
        uint8_t w = synapse_weight_discrete(i, i + 1000000, seed);
        buckets[w]++;
    }
    float expected = (float)n_samples / 26.0f;
    float chi2 = 0.0f;
    for (int b = 0; b < 26; b++) {
        float diff = (float)buckets[b] - expected;
        chi2 += (diff * diff) / expected;
    }
    printf("Hash distribution chi2 = %.2f (26 buckets, %u samples)
",
           chi2, n_samples);
    printf("Expected chi2 < 38.89 (p=0.05, df=25)
");
    printf("Result: %s
", chi2 < 38.89f ? "PASS" : "FAIL");
}

/* Collision rate testi */
void hash_collision_test(uint32_t seed, uint32_t n_pairs) {
    uint32_t collisions = 0;
    for (uint32_t i = 0; i < n_pairs; i++) {
        uint32_t h1 = hash_pair(i, i + 1, seed);
        uint32_t h2 = hash_pair(i + 1, i, seed);
        if (h1 == h2) collisions++;
    }
    printf("Collision rate: %u / %u = %.6f%%
",
           collisions, n_pairs, 100.0f * (float)collisions / (float)n_pairs);
}
