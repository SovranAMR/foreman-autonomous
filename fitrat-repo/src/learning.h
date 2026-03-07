/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * learning.h — Fıtrat AI v16 — ZAMAN ALGISI + TEACH TAG
 *
 * SpikeRecord artık iki temporal damga taşıyor:
 *   last_spike_tick — doğal ateşlemeler (tick_fire tarafından yazılır)
 *   teach_tick      — teach tarafından yazılan temporal sıra damgası
 *   teach_char_idx  — teach edilen karakter indeksi (0=ilk, 1=ikinci...)
 *
 * Output okuma teach_tick kullanır — çünkü doğal spike'lar henüz
 * temporal sıra öğrenememiş olabilir. Öğrenme ilerledikçe doğal spike'lar
 * da aynı sırayı taklit etmeye başlayacak.
 */

#ifndef FITRAT_LEARNING_H
#define FITRAT_LEARNING_H

#include "neuron.h"
#include "grid.h"
#include "bloom.h"
#include "synapse_table.h"

/* STDP pencere parametreleri */
#define STDP_TAU_PLUS   20.0f
#define STDP_TAU_MINUS  20.0f
#define STDP_A_PLUS     0.01f
#define STDP_A_MINUS    0.012f
#define STDP_WINDOW     40u

/* Spike zamanı kaydı — genişletilmiş */
typedef struct {
    uint32_t last_spike_tick;  /* Doğal ateşleme zamanı (tick_fire yazar) */
    uint32_t teach_tick;       /* Teach temporal damgası (io_teach_char yazar) */
    uint8_t  teach_char_idx;   /* Bu nöron hangi karakter için teach edildi */
    uint8_t  teach_active;     /* Son teach hâlâ geçerli mi (1=evet) */
    uint16_t fire_count;       /* Doğal ateşleme sayacı (son eğitim periyodu) */
} SpikeRecord;

/* Öğrenme sistemini başlat */
SpikeRecord *learning_init(uint32_t max_neuron_id);

/* Öğrenme sistemini yok et */
void learning_destroy(SpikeRecord *records);

/* Spike kaydı güncelle */
void learning_record_spike(SpikeRecord *records, uint32_t neuron_id,
                           uint32_t current_tick);

/* STDP: modulator adjustment + bloom filter insert for overrides */
void learning_apply_stdp(Neuron *neurons,
                         const uint32_t *active_ids, uint32_t active_count,
                         SpikeRecord *records,
                         SpatialGrid *grid, BloomFilter *bloom,
                         const FireEvent *events, uint32_t event_count,
                         const SimState *state,
                         SynapseTable *synapse_table);

/* İçsel plastisite */
void learning_intrinsic_plasticity(Neuron *neurons,
                                    const uint32_t *active_ids,
                                    uint32_t active_count);

/* Sinaptik ölçekleme */
void learning_synaptic_scaling(Neuron *neurons,
                                const uint32_t *active_ids,
                                uint32_t active_count,
                                SpatialGrid *grid);

#endif /* FITRAT_LEARNING_H */

/* ─── Competitive Learning: Anti-Hebbian ─── */
/* Teach sırasında hedef OLMAYAN output populasyonlarını zayıflat.
 * Bu, ayrışma sağlar — sadece doğru populasyonlar güçlü kalır.
 *
 * teach_chars: teach edilen karakterlerin indeksleri (PHONETIC_POOL'daki)
 * n_teach_chars: kaç karakter teach ediliyor
 */
void learning_competitive_inhibition(Neuron *neurons,
                                      const uint32_t *active_ids,
                                      uint32_t active_count,
                                      SpikeRecord *records,
                                      SynapseTable *synapse_table,
                                      BloomFilter *bloom,
                                      const int *teach_chars,
                                      int n_teach_chars,
                                      float inhibition_strength,
                                      uint64_t tick);
