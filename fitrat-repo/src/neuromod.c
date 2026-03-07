/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#include "neuromod.h"
#include <math.h>
#include <stdio.h>

#define VALENCE_DECAY 0.99f
#define NOVELTY_ALPHA 0.10f

void neuromod_update(SimState *state, float dt) {
    (void)dt;
    state->neuromod.valence *= VALENCE_DECAY;
    neuromod_update_curiosity(state);

    float valence_boost = state->neuromod.valence > 0.0f ?
                          state->neuromod.valence * 0.5f : 0.0f;
    float curiosity_boost = state->neuromod.curiosity * 0.3f;
    state->neuromod.learning_mod = 1.0f + valence_boost + curiosity_boost;
    if (state->neuromod.learning_mod > 2.0f)
        state->neuromod.learning_mod = 2.0f;
    if (state->neuromod.learning_mod < 0.1f)
        state->neuromod.learning_mod = 0.1f;
}

void neuromod_set_mode(SimState *state, SimPhase mode) {
    switch (mode) {
        case PHASE_LEARNING:
            state->neuromod.valence = 0.5f;
            state->neuromod.arousal = 0.7f;
            state->neuromod.curiosity = 0.8f;
            break;
        case PHASE_CREATIVE:
            state->neuromod.valence = 0.3f;
            state->neuromod.arousal = 0.4f;
            state->neuromod.curiosity = 0.9f;
            break;
        case PHASE_ANALYTIC:
            state->neuromod.valence = 0.0f;
            state->neuromod.arousal = 0.8f;
            state->neuromod.curiosity = 0.3f;
            break;
        default: break;
    }
}

void neuromod_reward(SimState *state, float amount) {
    state->neuromod.valence += amount;
    if (state->neuromod.valence > 1.0f) state->neuromod.valence = 1.0f;
    if (state->neuromod.valence < -1.0f) state->neuromod.valence = -1.0f;
}

void neuromod_update_curiosity(SimState *state) {
    float prediction_error = fabsf(state->avg_activation -
                                    state->prev_avg_activation);
    state->novelty_ema = state->novelty_ema * (1.0f - NOVELTY_ALPHA) +
                         prediction_error * NOVELTY_ALPHA;
    state->neuromod.curiosity = tanhf(state->novelty_ema * 10.0f);
}

void neuromod_print(const SimState *state) {
    printf("  neuromod: V=%.3f A=%.3f C=%.3f LM=%.3f | novelty=%.4f
",
           state->neuromod.valence, state->neuromod.arousal,
           state->neuromod.curiosity, state->neuromod.learning_mod,
           state->novelty_ema);
}
