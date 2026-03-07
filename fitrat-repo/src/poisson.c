/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * poisson.c — Poisson Bridge Implementation
 */

#include "poisson.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static uint64_t pois_rng(uint64_t *s) {
    uint64_t x = *s; x ^= x << 13; x ^= x >> 7; x ^= x << 17; *s = x; return x;
}

PoissonBridge *poisson_create(uint32_t region_count) {
    PoissonBridge *b = (PoissonBridge *)calloc(region_count, sizeof(PoissonBridge));
    if (!b) return NULL;
    for (uint32_t i = 0; i < region_count; i++) {
        b[i].region_id = i;
    }
    return b;
}

void poisson_destroy(PoissonBridge *bridges) {
    free(bridges);
}

uint32_t poisson_float_to_spikes(Neuron *neurons,
                                  const uint32_t *region_neuron_ids,
                                  uint32_t region_neuron_count,
                                  float activation, float dt,
                                  uint64_t *rng_state) {
    /* Poisson process: P(spike) = activation × dt per neuron */
    uint32_t threshold = (uint32_t)(activation * dt * (float)UINT32_MAX);
    uint32_t injected = 0;

    for (uint32_t i = 0; i < region_neuron_count; i++) {
        uint32_t nid = region_neuron_ids[i];
        if (!NEURON_IS_ALIVE(neurons[nid])) continue;

        uint32_t r = (uint32_t)(pois_rng(rng_state) & 0xFFFFFFFF);
        if (r < threshold) {
            /* Spike injection */
            uint16_t new_act = (uint16_t)neurons[nid].activation + 200;
            neurons[nid].activation = new_act > 255 ? 255 : (uint8_t)new_act;
            injected++;
        }
    }
    return injected;
}

float poisson_spikes_to_float(PoissonBridge *bridge,
                               uint32_t spike_count_this_tick) {
    /* Update sliding window */
    uint32_t old_count = bridge->spike_history[bridge->history_idx];
    bridge->total_spikes -= old_count;
    bridge->total_spikes += spike_count_this_tick;
    bridge->spike_history[bridge->history_idx] = spike_count_this_tick;
    bridge->history_idx = (bridge->history_idx + 1) % POISSON_WINDOW_SIZE;

    /* Rate = total_spikes / (window_size × neuron_count) */
    if (bridge->neuron_count == 0) return 0.0f;
    float rate = (float)bridge->total_spikes /
                 ((float)POISSON_WINDOW_SIZE * (float)bridge->neuron_count);
    if (rate > 1.0f) rate = 1.0f;

    bridge->macrocolumn_activation = rate;
    return rate;
}

void poisson_update_all(PoissonBridge *bridges, uint32_t count) {
    (void)bridges; (void)count;
    /* No-op for now — bridges update in main loop */
}

void poisson_print_stats(const PoissonBridge *bridge) {
    printf("  [POISSON] region=%u act=%.4f spikes=%u neurons=%u
",
           bridge->region_id, bridge->macrocolumn_activation,
           bridge->total_spikes, bridge->neuron_count);
}
