/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_SLEEP_H
#define FITRAT_SLEEP_H

#include "neuron.h"

SimPhase sleep_check_phase(SimState *state);
uint32_t sleep_rem_stimulate(Neuron *neurons, const uint32_t *active_ids,
                              uint32_t count, SimState *state, uint64_t seed);
void sleep_tafakkur(Neuron *neurons, const uint32_t *active_ids,
                    uint32_t count, SimState *state, uint64_t seed);
void sleep_log_dream(const Neuron *neurons, const FireEvent *events,
                     uint32_t event_count, uint64_t tick);

#endif
