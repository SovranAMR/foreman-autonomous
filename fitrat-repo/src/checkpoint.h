/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_CHECKPOINT_H
#define FITRAT_CHECKPOINT_H

#include "neuron.h"
#include <stdint.h>

#pragma pack(push, 1)
typedef struct {
    char     magic[8];
    uint32_t version;
    uint32_t neuron_count;    /* active neuron count */
    uint32_t max_slot;        /* max Morton ID used */
    uint64_t tick;
    SimState state;
} CheckpointHeader;
#pragma pack(pop)

int checkpoint_save(const char *path, const Neuron *neurons,
                    const uint32_t *active_ids, uint32_t count,
                    const SimState *state);

/* Returns neurons array (caller frees). Loads active_ids too. */
Neuron *checkpoint_load(const char *path, uint32_t **out_active_ids,
                         uint32_t *out_count, uint32_t *out_max_slot,
                         SimState *out_state);

#endif
