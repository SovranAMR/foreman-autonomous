/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#include "homeostasis.h"
#include <stdio.h>

void homeostasis_update_ei_balance(SimState *state, Neuron *neurons,
                                    const uint32_t *active_ids, uint32_t count) {
    uint32_t exc = 0, inh = 0;
    for (uint32_t i = 0; i < count; i++) {
        Neuron *n = &neurons[active_ids[i]];
        if (!NEURON_IS_ALIVE(*n)) continue;
        if (NEURON_IS_INHIBITORY(*n)) inh++; else exc++;
    }
    uint32_t total = exc + inh;
    if (total == 0) return;
    state->exc_ratio = (float)exc / (float)total;
    state->alive_count = total;
}

void homeostasis_update_avg_activation(SimState *state, Neuron *neurons,
                                        const uint32_t *active_ids, uint32_t count) {
    state->prev_avg_activation = state->avg_activation;
    uint64_t sum = 0;
    uint32_t alive = 0;
    for (uint32_t i = 0; i < count; i++) {
        Neuron *n = &neurons[active_ids[i]];
        if (!NEURON_IS_ALIVE(*n)) continue;
        sum += n->activation;
        alive++;
    }
    if (alive == 0) return;
    state->avg_activation = (float)sum / (float)alive / 255.0f;
}

void homeostasis_tick(SimState *state, Neuron *neurons,
                      const uint32_t *active_ids, uint32_t count) {
    homeostasis_update_avg_activation(state, neurons, active_ids, count);
    if (state->tick % 200 == 0) {
        homeostasis_update_ei_balance(state, neurons, active_ids, count);
    }
}
