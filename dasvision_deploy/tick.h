#ifndef TICK_H
#define TICK_H

#include <stdint.h>
#include <stdbool.h>

#define NEURON_COUNT 10000
#define INPUT_NEURONS 48
#define OUTPUT_NEURONS 27
#define MAX_SYNAPSES_PER_NEURON 128

typedef struct {
    float potential;
    float recovery;
    uint32_t flags;
    uint32_t tag;
} Neuron;

typedef struct {
    uint32_t target;
    float weight;
} Synapse;

typedef struct {
    uint32_t key;
    float weight;
} SynapseEntry;

#define SYNAPSE_KEY_PACK(src, dst) (((uint32_t)(src) << 14) | (uint32_t)(dst))
#define SYNAPSE_KEY_EMPTY 0xFFFFFFFF
#define SYNAPSE_KEY_DELETED 0xFFFFFFFE

typedef struct SynapseTable {
    uint32_t capacity;
    uint32_t count;
    uint32_t mask;
    SynapseEntry* entries;
} SynapseTable;

typedef struct {
    Neuron* neurons;
    Synapse* synapses;
    uint32_t tick_count;
    float global_modulator;
} TickContext;

// Function declarations
float synapse_weight_f(uint32_t src, uint32_t dst);
void tick_init(TickContext* ctx);
void tick_step(TickContext* ctx);
void tick_teardown(TickContext* ctx);

#endif