/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * tick.h — CPU-Side Tick Orchestrator
 *
 * Ana döngü sırası:
 * 1. fire → activation >= threshold → event queue
 * 2. propagate → hash connectivity, accumulate
 * 3. stdp → pozisyon kayması (Hebbian yaklaşma) — NOT: Morton codes ile
 *    pozisyon sabit. STDP override table'a yazılır.
 * 4. decay → activation decay, EMA update, homeostasis
 * 5. neuromod → valence, arousal, curiosity update
 * 6. sleep check → REM/tefekkür faz geçişi
 * 7. evolution check → doğum/ölüm (her 10K tick)
 * 8. output check → output katmanını oku
 * 9. checkpoint check → kaydet (her 100K tick)
 */

#ifndef FITRAT_TICK_H
#define FITRAT_TICK_H

#include "neuron.h"
#include "grid.h"
#include "learning.h"
#include "bloom.h"
#include "synapse_table.h"

/* Tick context — tüm state'i bir arada tutar */
typedef struct {
    Neuron       *neurons;      /* neuron_id ile indekslenmiş (sparse array) */
    uint32_t     *active_ids;   /* canlı nöron ID listesi (Morton codes) */
    uint32_t      active_count; /* canlı nöron sayısı */
    uint32_t      max_neurons;  /* max slot sayısı (MORTON_MAX üst sınırı) */
    SpatialGrid  *grid;
    SpikeRecord  *spike_records;
    BloomFilter  *bloom;        /* STDP override bloom filter */
    SynapseTable *synapse_table;  /* Gerçek sinaptik ağırlık tablosu */
    SimState      state;

    /* Event buffer */
    FireEvent    *fire_events;
    uint32_t      fire_event_count;
    uint32_t      fire_event_capacity;

    /* IO */
    char          output_buf[1024];
    uint32_t      output_len;

    /* Config */
    const char   *checkpoint_path;
    uint64_t      rng_seed;
} TickContext;

/* Context oluştur ve nöronları başlat */
TickContext *tick_create(uint32_t initial_count, uint32_t max_count);

/* Context yok et */
void tick_destroy(TickContext *ctx);

/* Tek tick çalıştır (CPU-only versiyon) */
void tick_step_cpu(TickContext *ctx);
void tick_step_gpu(TickContext *ctx);

/* Durum logla */
void tick_print_status(const TickContext *ctx);

#endif /* FITRAT_TICK_H */
