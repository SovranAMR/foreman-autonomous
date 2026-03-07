/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#include "sleep.h"
#include "morton.h"
#include <stdio.h>
#include <math.h>

static uint64_t sleep_rng(uint64_t *s) {
    uint64_t x = *s; x ^= x << 13; x ^= x >> 7; x ^= x << 17; *s = x; return x;
}

SimPhase sleep_check_phase(SimState *state) {
    if (state->phase == PHASE_REM) {
        state->phase_tick++;
        if (state->phase_tick >= REM_DURATION) {
            state->phase = PHASE_NORMAL;
            state->phase_tick = 0;
            fprintf(stderr, "  [SLEEP] REM ended at tick %lu
", (unsigned long)state->tick);
        }
        return PHASE_REM;
    }
    if (state->phase == PHASE_TAFAKKUR) {
        state->phase_tick++;
        if (state->phase_tick >= 200) {
            state->phase = PHASE_NORMAL;
            state->phase_tick = 0;
        }
        return PHASE_TAFAKKUR;
    }
    if (state->tick > 0 && state->tick % REM_PERIOD == 0) {
        state->phase = PHASE_REM;
        state->phase_tick = 0;
        fprintf(stderr, "  [SLEEP] REM started at tick %lu
", (unsigned long)state->tick);
        return PHASE_REM;
    }
    /* Low activity → tafakkur */
    if (state->avg_activation < 0.02f && state->tick > 100) {
        state->phase = PHASE_TAFAKKUR;
        state->phase_tick = 0;
        return PHASE_TAFAKKUR;
    }
    return PHASE_NORMAL;
}

uint32_t sleep_rem_stimulate(Neuron *neurons, const uint32_t *active_ids,
                              uint32_t count, SimState *state, uint64_t seed) {
    uint64_t rng = seed ^ state->tick;
    uint32_t stimulated = 0;
    for (uint32_t i = 0; i < count; i++) {
        uint32_t nid = active_ids[i];
        if (!NEURON_IS_ALIVE(neurons[nid])) continue;
        if ((sleep_rng(&rng) % 100) != 0) continue; /* %1 */
        uint8_t inject = (uint8_t)(128 + sleep_rng(&rng) % 128);
        uint16_t new_act = (uint16_t)neurons[nid].activation + inject;
        neurons[nid].activation = new_act > 255 ? 255 : (uint8_t)new_act;
        stimulated++;
    }
    return stimulated;
}

void sleep_tafakkur(Neuron *neurons, const uint32_t *active_ids,
                    uint32_t count, SimState *state, uint64_t seed) {
    (void)state;
    uint64_t rng = seed ^ state->tick ^ 0x7AFA0012ULL;
    /* NOT: 0x7AFA0012ULL invalid hex — fix below */
    rng = seed ^ state->tick ^ 0x7AFA0012ULL;
    for (uint32_t i = 0; i < count; i++) {
        uint32_t nid = active_ids[i];
        if (!NEURON_IS_ALIVE(neurons[nid])) continue;
        uint8_t z = morton_z(nid);
        /* Orta katmanlara odaklan (z 64-192) */
        if (z < 64 || z > 192) continue;
        /* Daha önce aktif olanlara öncelik */
        if (neurons[nid].ema < 20) continue;
        if ((sleep_rng(&rng) % 20) != 0) continue; /* %5 */
        uint16_t new_act = (uint16_t)neurons[nid].activation + 40;
        neurons[nid].activation = new_act > 255 ? 255 : (uint8_t)new_act;
    }
}

void sleep_log_dream(const Neuron *neurons, const FireEvent *events,
                     uint32_t event_count, uint64_t tick) {
    if (event_count < 10) return;
    fprintf(stderr, "  [DREAM] T=%lu: %u neurons active in dream state
",
           (unsigned long)tick, event_count);
}
