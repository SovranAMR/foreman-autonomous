/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * poisson.h — Poisson Bridge (Macrocolumn ↔ Spotlight Transition)
 *
 * Macrocolumn float activation → spike: rand() < activation × dt → spike inject
 * Spotlight spike → macrocolumn: sliding window count / window_length = float
 *
 * Human Brain Project standard bridge protocol.
 */

#ifndef FITRAT_POISSON_H
#define FITRAT_POISSON_H

#include "neuron.h"
#include <stdint.h>

/* Sliding window for spike→float conversion */
#define POISSON_WINDOW_SIZE 20  /* ticks */

typedef struct {
    uint32_t  region_id;
    float     macrocolumn_activation;  /* L2 float [0, 1] */
    uint32_t  spike_history[POISSON_WINDOW_SIZE];  /* spike counts per tick */
    uint32_t  history_idx;
    uint32_t  total_spikes;
    uint32_t  neuron_count;  /* neurons in this region */
} PoissonBridge;

/* Bridge başlat (N bölge için) */
PoissonBridge *poisson_create(uint32_t region_count);

/* Bridge yok et */
void poisson_destroy(PoissonBridge *bridges);

/* L2→L3: Macrocolumn float → spike injection
 * activation = macrocolumn output (float [0,1])
 * dt = 1.0/tick_rate
 * Nöronlara Poisson process ile spike enjekte eder.
 * Return: injected spike count */
uint32_t poisson_float_to_spikes(Neuron *neurons,
                                  const uint32_t *region_neuron_ids,
                                  uint32_t region_neuron_count,
                                  float activation, float dt,
                                  uint64_t *rng_state);

/* L3→L2: Spotlight spike count → macrocolumn float
 * Sliding window ile spike rate hesaplar */
float poisson_spikes_to_float(PoissonBridge *bridge,
                               uint32_t spike_count_this_tick);

/* Tüm bridge'leri güncelle */
void poisson_update_all(PoissonBridge *bridges, uint32_t count);

/* Bridge istatistik */
void poisson_print_stats(const PoissonBridge *bridge);

#endif
