/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * learning.c — Fıtrat AI v16 — TEMPORAL CORRELATION + TEACH TAG
 */

#include "learning.h"
#include "synapse_table.h"
#include "hash.h"
#include "morton.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

SpikeRecord *learning_init(uint32_t max_neuron_id) {
    SpikeRecord *r = (SpikeRecord *)calloc(max_neuron_id, sizeof(SpikeRecord));
    return r;
}

void learning_destroy(SpikeRecord *records) {
    free(records);
}

void learning_record_spike(SpikeRecord *records, uint32_t neuron_id,
                           uint32_t current_tick) {
    records[neuron_id].last_spike_tick = current_tick;
    records[neuron_id].fire_count++;
}

/* STDP ağırlık değişimi hesapla */
static float stdp_dw(int32_t dt, float learning_mod) {
    if (dt > 0) {
        return STDP_A_PLUS * expf(-(float)dt / STDP_TAU_PLUS) * learning_mod;
    } else if (dt < 0) {
        return -STDP_A_MINUS * expf((float)dt / STDP_TAU_MINUS) * learning_mod;
    }
    return 0.0f;
}

void learning_apply_stdp(Neuron *neurons,
                         const uint32_t *active_ids, uint32_t active_count,
                         SpikeRecord *records,
                         SpatialGrid *grid, BloomFilter *bloom,
                         const FireEvent *events, uint32_t event_count,
                         const SimState *state,
                         SynapseTable *synapse_table) {
    (void)active_ids;
    (void)active_count;

    float lr = state->neuromod.learning_mod;
    if (state->phase == PHASE_REM) lr *= 0.5f;

    for (uint32_t e = 0; e < event_count; e++) {
        uint32_t post_id = events[e].neuron_id;
        Neuron *post = &neurons[post_id];

        if (NEURON_PLASTICITY(*post) == 3) continue;

        float effective_lr = lr * NEURON_MOD_F(*post);
        uint32_t post_tick = records[post_id].last_spike_tick;

        uint16_t cx = morton_grid_cx(post_id);
        uint16_t cy = morton_grid_cy(post_id);
        uint8_t  cz = morton_grid_cz(post_id);

        uint32_t neighbors[2048];
        uint32_t nn = grid_get_neighbors(grid, cx, cy, cz, neighbors, 2048);

        for (uint32_t j = 0; j < nn; j++) {
            uint32_t pre_id = neighbors[j];
            if (pre_id == post_id) continue;
            if (!NEURON_IS_ALIVE(neurons[pre_id])) continue;

            float dist_sq = morton_distance_sq(pre_id, post_id);
            if (dist_sq > 2500.0f) continue;

            float dist = sqrtf(dist_sq);
            uint32_t threshold = distance_threshold(dist, LAMBDA_LOCAL,
                                                     BASE_PROB_LOCAL);
            if (!synapse_exists(pre_id, post_id, HASH_SEED_CONNECTIVITY,
                                threshold))
                continue;

            uint32_t pre_tick = records[pre_id].last_spike_tick;
            if (pre_tick == 0 || post_tick == 0) continue;

            int32_t dt = (int32_t)post_tick - (int32_t)pre_tick;
            if (dt > (int32_t)STDP_WINDOW || dt < -(int32_t)STDP_WINDOW)
                continue;

            float dw = stdp_dw(dt, effective_lr);
            if (fabsf(dw) < 1e-6f) continue;

            /* Sinaptik ağırlık tablosuna yaz — GERÇEK öğrenme */
            if (synapse_table) {
                synapse_table_update(synapse_table, pre_id, post_id,
                                     dw, state->tick);
            }

            /* Modulator da güncelle (nöronal excitability) */
            float mod = NEURON_MOD_F(neurons[pre_id]);
            mod += dw * 0.1f;  /* modulator daha yavaş değişir */
            if (mod < 0.02f) mod = 0.02f;
            if (mod > 1.98f) mod = 1.98f;
            neurons[pre_id].modulator = F_TO_MOD(mod);

            if (bloom) {
                bloom_insert(bloom, pre_id, post_id);
            }
        }
    }
}

void learning_intrinsic_plasticity(Neuron *neurons,
                                    const uint32_t *active_ids,
                                    uint32_t active_count) {
    for (uint32_t i = 0; i < active_count; i++) {
        uint32_t nid = active_ids[i];
        Neuron *n = &neurons[nid];
        if (!NEURON_IS_ALIVE(*n)) continue;
        if (NEURON_PLASTICITY(*n) == 3) continue;

        if (n->ema > TARGET_ACTIVATION_INT && n->threshold < 255) {
            n->threshold += INTRINSIC_PLASTICITY_INT;
        } else if (n->ema < TARGET_ACTIVATION_INT && n->threshold > 13) {
            n->threshold -= INTRINSIC_PLASTICITY_INT;
        }
    }
}

void learning_synaptic_scaling(Neuron *neurons,
                                const uint32_t *active_ids,
                                uint32_t active_count,
                                SpatialGrid *grid) {
    for (uint32_t i = 0; i < active_count; i++) {
        uint32_t nid = active_ids[i];
        if (!NEURON_IS_ALIVE(neurons[nid])) continue;

        uint16_t cx = morton_grid_cx(nid);
        uint16_t cy = morton_grid_cy(nid);
        uint8_t  cz = morton_grid_cz(nid);

        uint32_t neighbors[512];
        uint32_t nn = grid_get_neighbors(grid, cx, cy, cz, neighbors, 512);
        if (nn < 2) continue;

        float avg_dist = 0.0f;
        uint32_t valid = 0;
        for (uint32_t j = 0; j < nn; j++) {
            if (neighbors[j] == nid) continue;
            float d = sqrtf(morton_distance_sq(nid, neighbors[j]));
            avg_dist += d;
            valid++;
        }
        if (valid == 0) continue;
        avg_dist /= (float)valid;

        float target_dist = (float)GRID_CELL_SIZE * 0.5f;
        float ratio = target_dist / (avg_dist + 0.001f);

        if (fabsf(ratio - 1.0f) > 0.1f) {
            float new_mod = NEURON_MOD_F(neurons[nid]) *
                            (1.0f + (ratio - 1.0f) * 0.1f);
            if (new_mod > 1.98f) new_mod = 1.98f;
            if (new_mod < 0.02f) new_mod = 0.02f;
            neurons[nid].modulator = F_TO_MOD(new_mod);
        }
    }
}

/* ═══ COMPETITIVE LEARNING — ANTI-HEBBIAN İNHİBİSYON ═══
 *
 * Eğitim sırasında: teach edilen karakterlerin populasyonları STDP ile
 * güçlendirilir (yukarıdaki learning_apply_stdp tarafından).
 *
 * Bu fonksiyon TERSTEN çalışır: hedef OLMAYAN output populasyonlarına
 * giden aktif sinapsları ZAYIFLATIR.
 *
 * Mekanizma:
 *   - Output katmanındaki tüm nöronları tara (z >= 48)
 *   - Teach edilen karakterlerin populasyonlarını ATLA
 *   - Kalan populasyonlardaki aktif nöronlar için:
 *     → input katmanından (z < 24) gelen aktif sinapsları bul
 *     → synapse_table'da negatif delta yaz (zayıflatma)
 *
 * Sonuç: Yanlış populasyonlara giden sinapslar zamanla zayıflar,
 *        doğru populasyonlara giden sinapslar güçlü kalır → AYRIŞMA.
 */

/* io.c'den gelen tanımlar — burada tekrar tanımlıyoruz */
#define CI_X_EXTENT    200
#define CI_POOL_SIZE   24
#define CI_BAND_WIDTH  (CI_X_EXTENT / CI_POOL_SIZE)

static inline int ci_x_to_char_idx(uint16_t x) {
    int i = (int)x / CI_BAND_WIDTH;
    return i >= CI_POOL_SIZE ? -1 : i;
}

void learning_competitive_inhibition(Neuron *neurons,
                                      const uint32_t *active_ids,
                                      uint32_t active_count,
                                      SpikeRecord *records,
                                      SynapseTable *synapse_table,
                                      BloomFilter *bloom,
                                      const int *teach_chars,
                                      int n_teach_chars,
                                      float inhibition_strength,
                                      uint64_t tick) {
    if (!synapse_table || !teach_chars || n_teach_chars <= 0) return;

    /* Teach edilen karakter setini bitmap'e çevir */
    uint32_t teach_set = 0;  /* max 24 karakter, 32-bit bitmap yeter */
    for (int i = 0; i < n_teach_chars && i < CI_POOL_SIZE; i++) {
        if (teach_chars[i] >= 0 && teach_chars[i] < CI_POOL_SIZE)
            teach_set |= (1u << teach_chars[i]);
    }

    /* Tüm aktif nöronları tara */
    for (uint32_t i = 0; i < active_count; i++) {
        uint32_t post_id = active_ids[i];
        if (!NEURON_IS_ALIVE(neurons[post_id])) continue;

        /* Sadece OUTPUT katmanı (z >= 48) */
        uint8_t z = morton_z(post_id);
        if (z < 48) continue;

        /* Bu nöronun hangi karaktere ait olduğunu bul */
        uint16_t x = morton_x(post_id);
        int cidx = ci_x_to_char_idx(x);
        if (cidx < 0 || cidx >= CI_POOL_SIZE) continue;

        /* Eğer bu karakter teach setindeyse → ATLA (güçlendirilecek) */
        if (teach_set & (1u << cidx)) continue;

        /* Bu nöron HEDEF OLMAYAN bir output populasyonunda.
         * Gelen bağlantıları zayıflat. */

        /* Bu nöronun aktif olup olmadığını kontrol et */
        if (neurons[post_id].activation < 20) continue;

        /* Input katmanından gelen aktif pre-sinaptik nöronları bul */
        for (uint32_t j = 0; j < active_count; j++) {
            uint32_t pre_id = active_ids[j];
            if (pre_id == post_id) continue;
            if (!NEURON_IS_ALIVE(neurons[pre_id])) continue;

            /* Sadece input/hidden katman nöronları (z < 48) */
            uint8_t pre_z = morton_z(pre_id);
            if (pre_z >= 48) continue;

            /* Sinaptik bağlantı var mı? */
            float dist_sq = morton_distance_sq(pre_id, post_id);
            if (dist_sq > 2500.0f) continue;

            float dist = sqrtf(dist_sq);
            uint32_t threshold = distance_threshold(dist, LAMBDA_LOCAL,
                                                     BASE_PROB_LOCAL);
            if (!synapse_exists(pre_id, post_id, HASH_SEED_CONNECTIVITY,
                                threshold))
                continue;

            /* Pre nöron aktif mi? */
            if (neurons[pre_id].activation < 20) continue;

            /* ZAYIFLAT: negatif delta yaz */
            float dw = -inhibition_strength;
            synapse_table_update(synapse_table, pre_id, post_id, dw, tick);

            if (bloom)
                bloom_insert(bloom, pre_id, post_id);
        }
    }
}
