/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#include "evolution.h"
#include "morton.h"
#include "hash.h"
#include <stdlib.h>
#include <stdio.h>

static uint64_t evo_rng(uint64_t *s) {
    uint64_t x = *s; x ^= x << 13; x ^= x >> 7; x ^= x << 17; *s = x; return x;
}

void evolution_tick(Neuron *neurons, uint32_t *active_ids,
                    uint32_t *active_count, uint32_t max_neurons,
                    SpatialGrid *grid, SimState *state, uint64_t seed) {
    uint64_t rng = seed ^ state->tick;
    uint32_t born = 0, dead = 0;
    uint32_t current_count = *active_count;

    for (uint32_t i = 0; i < current_count; ) {
        uint32_t nid = active_ids[i];
        Neuron *n = &neurons[nid];
        if (!NEURON_IS_ALIVE(*n)) { i++; continue; }

        uint32_t inactivity_limit;
        switch (NEURON_INACTIVITY_CLASS(*n)) {
            case 0: inactivity_limit = 1000; break;
            case 1: inactivity_limit = 5000; break;
            case 2: inactivity_limit = 10000; break;
            default: inactivity_limit = 50000; break;
        }

        if (n->last_fire_dt >= inactivity_limit && n->ema < 10) {
            n->flags &= ~FLAG_ALIVE;
            grid_remove(grid, nid);
            active_ids[i] = active_ids[current_count - 1];
            current_count--;
            dead++;
        } else {
            i++;
        }
    }

    uint32_t births_allowed = current_count / 1000 + 1; 
    for (uint32_t i = 0; i < current_count && born < births_allowed; i++) {
        uint32_t parent_id = active_ids[i];
        Neuron *parent = &neurons[parent_id];
        if (!NEURON_IS_ALIVE(*parent)) continue;
        if (!NEURON_CAN_REPRODUCE(*parent)) continue;
        if (parent->ema < 180) continue; 

        uint16_t px = morton_x(parent_id);
        uint16_t py = morton_y(parent_id);
        uint8_t  pz = morton_z(parent_id);

        uint32_t child_id = 0;
        int found = 0;
        for (int attempt = 0; attempt < 10; attempt++) {
            int16_t dx = (int16_t)(evo_rng(&rng) % 3) - 1;
            int16_t dy = (int16_t)(evo_rng(&rng) % 3) - 1;
            int8_t  dz = (int8_t)(evo_rng(&rng) % 3) - 1;
            int32_t nx = (int32_t)px + dx;
            int32_t ny = (int32_t)py + dy;
            int32_t nz = (int32_t)pz + dz;
            if (nx < 0 || nx > MORTON_MAX_X) continue;
            if (ny < 0 || ny > MORTON_MAX_Y) continue;
            if (nz < 0 || nz > (int32_t)MORTON_MAX_Z) continue;
            child_id = morton_encode((uint16_t)nx, (uint16_t)ny, (uint8_t)nz);
            if (child_id >= max_neurons) continue;
            if (!NEURON_IS_ALIVE(neurons[child_id])) {
                found = 1;
                break;
            }
        }
        if (!found) continue;

        Neuron *child = &neurons[child_id];
        *child = *parent;
        child->activation = 5;
        child->ema = 5;
        child->last_fire_dt = 65535;

        uint8_t mut_rate = NEURON_MUTATION_RATE(*parent);
        if ((evo_rng(&rng) % 100) < mut_rate * 2) {
            int8_t delta = (int8_t)(evo_rng(&rng) % 7) - 3;
            int16_t new_thr = (int16_t)child->threshold + delta;
            if (new_thr < 20) new_thr = 20;
            if (new_thr > 240) new_thr = 240;
            child->threshold = (uint8_t)new_thr;
        }

        parent->activation = parent->activation / 3;

        if (current_count < max_neurons) {
            active_ids[current_count] = child_id;
            current_count++;
            grid_insert(grid, child_id);
            born++;
        }
    }

    *active_count = current_count;
    state->born_count = born;
    state->dead_count = dead;
    state->alive_count = current_count;

    if (born > 0 || dead > 0) {
        printf("  [EVO] T=%lu: born=%u dead=%u total=%u
",
               (unsigned long)state->tick, born, dead, current_count);
    }
}
