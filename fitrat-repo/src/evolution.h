/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_EVOLUTION_H
#define FITRAT_EVOLUTION_H

#include "neuron.h"
#include "grid.h"

void evolution_tick(Neuron *neurons, uint32_t *active_ids,
                    uint32_t *active_count, uint32_t max_neurons,
                    SpatialGrid *grid, SimState *state, uint64_t seed);

#endif
