/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_HOMEOSTASIS_H
#define FITRAT_HOMEOSTASIS_H

#include "neuron.h"

void homeostasis_update_ei_balance(SimState *state, Neuron *neurons,
                                    const uint32_t *active_ids, uint32_t count);
void homeostasis_update_avg_activation(SimState *state, Neuron *neurons,
                                        const uint32_t *active_ids, uint32_t count);
void homeostasis_tick(SimState *state, Neuron *neurons,
                      const uint32_t *active_ids, uint32_t count);

#endif
