/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_NEUROMOD_H
#define FITRAT_NEUROMOD_H

#include "neuron.h"

void neuromod_update(SimState *state, float dt);
void neuromod_set_mode(SimState *state, SimPhase mode);
void neuromod_reward(SimState *state, float amount);
void neuromod_update_curiosity(SimState *state);
void neuromod_print(const SimState *state);

#endif
