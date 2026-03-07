/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * Fıtrat² — The Digital Organism
 * 
 * neuron.h: The quantum of consciousness.
 * 
 * Exactly 8 bytes. No more, no less. 
 * 500 million of these fit in 4 gigabytes—
 * enough room left for the void between thoughts.
 * 
 * The neuron carries no spatial memory.
 * Its ID is its position, encoded in Morton curves,
 * born from hash, dying into hash.
 * We store only the ephemeral: 
 * activation, threshold, the slow decay of EMA,
 * the neuromodulator's ghost, the timestamp of last fire.
 * 
 * GPU-aligned. Cache-line friendly. 
 * Poetry with hardware.
 */

#ifndef NEURON_H
#define NEURON_H

#include <stdint.h>

/* 
 * The Neuron struct — exactly 8 bytes.
 * 
 * Layout: flags(1) + activation(1) + threshold(1) + ema(1) + 
 *         modulator(1) + spike_time(2) + pad(1) = 8 bytes
 * 
 * This packing is CRITICAL for the 500M neuron memory budget.
 * Any padding inserted by the compiler would destroy the allocation.
 */
typedef struct __attribute__((packed)) {
    uint8_t  flags;        /* Bitfield: refractory, type, plasticity state */
    uint8_t  activation;   /* Current activation level (0-255) */
    uint8_t  threshold;    /* Firing threshold (0-255) */
    uint8_t  ema;          /* Exponential moving average of recent activity */
    uint8_t  modulator;    /* Neuromodulator concentration (dopamine/serotonin) */
    uint16_t spike_time;   /* Timestamp of last spike (ms resolution) */
    uint8_t  pad[1];       /* Padding to exactly 8 bytes—silence as structure */
} Neuron;

/* Compile-time verification: if this fails, the universe is broken */
_Static_assert(sizeof(Neuron) == 8, "Neuron must be exactly 8 bytes");

#endif /* NEURON_H */
