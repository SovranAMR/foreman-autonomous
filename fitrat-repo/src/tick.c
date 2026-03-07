/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * tick.c — CPU-Side Tick Orchestrator (Morton Code + Bloom Filter Edition)
 *
 * Nöron pozisyonları Morton ID'den decode edilir — sıfır ek bellek.
 * STDP override'lar Bloom filter ile filtrelenir.
 */

#include "tick.h"
#include "hash.h"
#include "morton.h"
#include "neuromod.h"
#include "homeostasis.h"
#include "sleep.h"
#include "evolution.h"
#include "learning.h"
#include "io.h"
#include "checkpoint.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>

/* xorshift64 RNG */
static uint64_t tick_rng(uint64_t *state) {
    uint64_t x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    return x;
}

TickContext *tick_create(uint32_t initial_count, uint32_t max_count) {
    TickContext *ctx = (TickContext *)calloc(1, sizeof(TickContext));
    if (!ctx) return NULL;

    /* Morton code check: Ensure nid is within array bounds. 
     * The default 200x200x64 grid generates IDs up to ~208M.
     * We allocate enough to cover the spatial volume or max_count, whichever is larger. */
    uint32_t allocation_count = max_count;
    if (allocation_count < 250000000) allocation_count = 250000000;
    
    ctx->max_neurons = allocation_count;
    ctx->neurons = (Neuron *)calloc(allocation_count, sizeof(Neuron));
    if (!ctx->neurons) {
        /* Fallback for low-memory systems */
        allocation_count = max_count > 10000000 ? max_count : 10000000;
        ctx->neurons = (Neuron *)calloc(allocation_count, sizeof(Neuron));
        if (!ctx->neurons) { free(ctx); return NULL; }
        ctx->max_neurons = allocation_count;
    }

    ctx->active_ids = (uint32_t *)calloc(ctx->max_neurons, sizeof(uint32_t));
    if (!ctx->active_ids) { free(ctx->neurons); free(ctx); return NULL; }

    ctx->grid = grid_create(initial_count / 4 + 1);
    if (!ctx->grid) { free(ctx->active_ids); free(ctx->neurons); free(ctx); return NULL; }

    ctx->spike_records = learning_init(ctx->max_neurons);
    if (!ctx->spike_records) {
        grid_destroy(ctx->grid);
        free(ctx->active_ids); free(ctx->neurons); free(ctx);
        return NULL;
    }

    /* Bloom filter — 1 GB for override table filtering */
    ctx->bloom = bloom_create();
    if (!ctx->bloom) {
        fprintf(stderr, "Warning: Bloom filter allocation failed (1GB). Continuing without.
");
    }

    ctx->fire_event_capacity = initial_count / 10 + 1024;
    ctx->fire_events = (FireEvent *)calloc(ctx->fire_event_capacity, sizeof(FireEvent));
    ctx->fire_event_count = 0;

    ctx->rng_seed = (uint64_t)time(NULL) ^ 0xF10A7002ULL;
    ctx->checkpoint_path = "fitrat2.ckpt";

    /* Sinaptik ağırlık tablosu — STDP ile öğrenilen bağlantılar */
    ctx->synapse_table = synapse_table_load("fitrat2.synapses");
    if (!ctx->synapse_table) {
        ctx->synapse_table = synapse_table_create(SYNAPSE_TABLE_INITIAL_SLOTS);
        fprintf(stderr, "[SYNAPSE] Yeni tablo olusturuldu
");
    }

    /* Nöronları rastgele Morton pozisyonlarla başlat */
    uint64_t rng = ctx->rng_seed;
    uint16_t extent_xy = 200; /* başlangıçta 200×200×64 grid */
    uint8_t  extent_z  = 64;

    uint32_t placed = 0;
    uint32_t attempts = 0;
    while (placed < initial_count && attempts < initial_count * 10) {
        uint16_t x = (uint16_t)(tick_rng(&rng) % extent_xy);
        uint16_t y = (uint16_t)(tick_rng(&rng) % extent_xy);
        uint8_t  z = (uint8_t)(tick_rng(&rng) % extent_z);
        uint32_t nid = morton_encode(x, y, z);

        if (nid >= ctx->max_neurons) {
            attempts++;
            continue;
        }

        if (NEURON_IS_ALIVE(ctx->neurons[nid])) {
            attempts++;
            continue; /* slot dolu */
        }

        Neuron *n = &ctx->neurons[nid];
        n->flags = FLAG_ALIVE | FLAG_CAN_REPRODUCE;

        /* %20 inhibitör (v1) */
        if ((tick_rng(&rng) % 100) < 20) {
            n->flags |= FLAG_INHIBITORY;
            n->threshold = F_TO_THR(0.20f);
        } else {
            n->threshold = F_TO_THR(0.15f);
        }

        /* Fıtrat: her hücre farklı */
        n->activation = (uint8_t)(tick_rng(&rng) % 20);
        n->ema = n->activation;
        n->modulator = (uint8_t)(96 + tick_rng(&rng) % 64); /* 0.75 - 1.25 arası */

        /* Plasticity class */
        uint64_t pclass = tick_rng(&rng) % 100;
        if (pclass < 20) n->flags |= FLAG_PLASTICITY_LOW;
        else if (pclass < 80) n->flags |= FLAG_PLASTICITY_MED;
        else n->flags |= FLAG_PLASTICITY_HIGH;

        /* Layer hint from Z */
        if (z < extent_z / 4) n->flags |= FLAG_LAYER_INPUT;
        else if (z < extent_z / 2) n->flags |= FLAG_LAYER_LOWER_MID;
        else if (z < 3 * extent_z / 4) n->flags |= FLAG_LAYER_UPPER_MID;
        else n->flags |= FLAG_LAYER_OUTPUT;

        /* DNA extra */
        uint8_t mut = (uint8_t)(tick_rng(&rng) % 6); /* 0-5% mutation */
        uint8_t inact = (uint8_t)(tick_rng(&rng) % 4);
        n->dna_extra = (mut << DNA_MUTATION_SHIFT) | (inact << DNA_INACTIVITY_SHIFT);

        n->last_fire_dt = 65535;

        ctx->active_ids[placed] = nid;
        grid_insert(ctx->grid, nid);
        placed++;
        attempts++;
    }

    ctx->active_count = placed;
    ctx->state.neuron_count = placed;
    ctx->state.alive_count = placed;
    ctx->state.neuromod.valence = 0.0f;
    ctx->state.neuromod.arousal = 0.3f;
    ctx->state.neuromod.curiosity = 0.5f;
    ctx->state.neuromod.learning_mod = 1.0f;
    ctx->state.phase = PHASE_NORMAL;

    fprintf(stderr, "Initialized %u neurons in %ux%ux%u grid (Morton encoded)
",
           placed, extent_xy, extent_xy, extent_z);
    return ctx;
}

void tick_destroy(TickContext *ctx) {
    /* Sinaptik tabloyu kaydet */
    if (ctx->synapse_table) {
        synapse_table_save(ctx->synapse_table, "fitrat2.synapses");
        synapse_table_stats(ctx->synapse_table);
        synapse_table_destroy(ctx->synapse_table);
        ctx->synapse_table = NULL;
    }
    if (!ctx) return;
    free(ctx->neurons);
    free(ctx->active_ids);
    grid_destroy(ctx->grid);
    learning_destroy(ctx->spike_records);
    if (ctx->bloom) bloom_destroy(ctx->bloom);
    free(ctx->fire_events);
    free(ctx);
}

/* Phase 1: Fire detection */
static void tick_fire(TickContext *ctx) {
    ctx->fire_event_count = 0;
    ctx->state.fired_count = 0;

    for (uint32_t i = 0; i < ctx->active_count; i++) {
        uint32_t nid = ctx->active_ids[i];
        Neuron *n = &ctx->neurons[nid];
        if (!NEURON_IS_ALIVE(*n)) continue;

        /* Clear previous fire flag */
        n->flags &= ~FLAG_FIRED;

        /* Increment last_fire_dt (saturating) */
        if (n->last_fire_dt < 65535) n->last_fire_dt++;

        if (n->activation >= n->threshold) {
            n->flags |= FLAG_FIRED;
            n->last_fire_dt = 0;

            /* Record spike time for STDP */
            learning_record_spike(ctx->spike_records, nid,
                                  (uint32_t)ctx->state.tick);

            if (ctx->fire_event_count < ctx->fire_event_capacity) {
                ctx->fire_events[ctx->fire_event_count].neuron_id = nid;
                ctx->fire_events[ctx->fire_event_count].activation_at_fire =
                    n->activation;
                ctx->fire_event_count++;
            }
            ctx->state.fired_count++;
        }
    }
}

/* Phase 2: Propagation via procedural connectivity */
static void tick_propagate(TickContext *ctx) {
    if (ctx->fire_event_count == 0) return;

    for (uint32_t e = 0; e < ctx->fire_event_count; e++) {
        uint32_t pre_id = ctx->fire_events[e].neuron_id;
        Neuron *pre = &ctx->neurons[pre_id];

        /* Grid komşularını bul */
        uint16_t cx = morton_grid_cx(pre_id);
        uint16_t cy = morton_grid_cy(pre_id);
        uint8_t  cz = morton_grid_cz(pre_id);

        uint32_t neighbors[2048];
        uint32_t nn = grid_get_neighbors(ctx->grid, cx, cy, cz,
                                         neighbors, 2048);

        for (uint32_t j = 0; j < nn; j++) {
            uint32_t post_id = neighbors[j];
            if (post_id == pre_id) continue;
            if (!NEURON_IS_ALIVE(ctx->neurons[post_id])) continue;

            /* Mesafe = Morton decode distance */
            float dist_sq = morton_distance_sq(pre_id, post_id);
            if (dist_sq > 10000.0f) continue; /* max ~100 units */
            float dist = sqrtf(dist_sq);

            /* Mesafe bazlı bağlantı olasılığı */
            uint32_t threshold = distance_threshold(dist, LAMBDA_LOCAL,
                                                     BASE_PROB_LOCAL);
            if (!synapse_exists(pre_id, post_id, HASH_SEED_CONNECTIVITY,
                                threshold))
                continue;

            /* Sinaptik ağırlık: önce öğrenilmiş tablo, yoksa hash */
            float w;
            float base_w = synapse_weight_f(pre_id, post_id, HASH_SEED_WEIGHT);
            if (ctx->synapse_table && ctx->bloom &&
                bloom_maybe_exists(ctx->bloom, pre_id, post_id)) {
                float learned = synapse_table_get(ctx->synapse_table, pre_id, post_id);
                if (learned == learned) {  /* NaN check — __builtin_nanf */
                    w = base_w + learned;  /* base + delta */
                    if (w < 0.0f) w = 0.0f;
                    if (w > 1.0f) w = 1.0f;
                } else {
                    w = base_w;
                }
            } else {
                w = base_w;
            }

            float sign = NEURON_IS_INHIBITORY(*pre) ? -1.0f : 1.0f;
            float energy = NEURON_ACT_F(*pre) * w * sign * 0.3f;

            Neuron *post = &ctx->neurons[post_id];
            float new_act = NEURON_ACT_F(*post) + energy;
            if (new_act < 0.0f) new_act = 0.0f;
            if (new_act > 1.0f) new_act = 1.0f;
            post->activation = F_TO_ACT(new_act);
        }
    }
}

/* Phase 3: STDP */
static void tick_stdp(TickContext *ctx) {
    if (ctx->fire_event_count == 0) return;
    learning_apply_stdp(ctx->neurons, ctx->active_ids, ctx->active_count,
                        ctx->spike_records, ctx->grid, ctx->bloom,
                        ctx->fire_events, ctx->fire_event_count,
                        &ctx->state,
                        ctx->synapse_table);
}

/* Phase 4: Decay + EMA + Homeostasis */
static void tick_decay(TickContext *ctx) {
    for (uint32_t i = 0; i < ctx->active_count; i++) {
        uint32_t nid = ctx->active_ids[i];
        Neuron *n = &ctx->neurons[nid];
        if (!NEURON_IS_ALIVE(*n)) continue;

        /* Activation decay: a × 235/256 ≈ 0.918 */
        n->activation = (uint8_t)((uint16_t)n->activation *
                                   ACTIVATION_DECAY_INT / 256);

        /* EMA update */
        n->ema = (uint8_t)(((uint16_t)n->ema * (256 - EMA_ALPHA_INT) +
                             (uint16_t)n->activation * EMA_ALPHA_INT) / 256);
    }

    /* Intrinsic plasticity */
    learning_intrinsic_plasticity(ctx->neurons, ctx->active_ids,
                                  ctx->active_count);
}

void tick_step_cpu(TickContext *ctx) {
    tick_fire(ctx);
    tick_propagate(ctx);
    tick_stdp(ctx);
    tick_decay(ctx);

    /* Neuromodulation */
    neuromod_update(&ctx->state, 1.0f);

    /* Sleep/Tefekkür check */
    SimPhase phase = sleep_check_phase(&ctx->state);
    if (phase == PHASE_REM) {
        sleep_rem_stimulate(ctx->neurons, ctx->active_ids, ctx->active_count,
                           &ctx->state, ctx->rng_seed);
        sleep_log_dream(ctx->neurons, ctx->fire_events,
                        ctx->fire_event_count, ctx->state.tick);
    } else if (phase == PHASE_TAFAKKUR) {
        sleep_tafakkur(ctx->neurons, ctx->active_ids, ctx->active_count,
                       &ctx->state, ctx->rng_seed);
    }

    /* Homeostasis */
    homeostasis_tick(&ctx->state, ctx->neurons, ctx->active_ids,
                     ctx->active_count);

    /* Evolution */
    if (0) {
        evolution_tick(ctx->neurons, ctx->active_ids, &ctx->active_count,
                       ctx->max_neurons, ctx->grid, &ctx->state,
                       ctx->rng_seed);
        ctx->state.neuron_count = ctx->active_count;
    }

    /* Sinaptik ölçekleme (her 500 tick) */
    if (ctx->state.tick % 500 == 0) {
        learning_synaptic_scaling(ctx->neurons, ctx->active_ids,
                                  ctx->active_count, ctx->grid);
    }

    /* Checkpoint */
    if (ctx->state.tick % CHECKPOINT_PERIOD == 0 && ctx->state.tick > 0) {
        if (ctx->checkpoint_path) {
            checkpoint_save(ctx->checkpoint_path, ctx->neurons,
                           ctx->active_ids, ctx->active_count, &ctx->state);
        }
    }

    ctx->state.tick++;
}

void tick_print_status(const TickContext *ctx) {
    const SimState *s = &ctx->state;
    fprintf(stderr, "T=%lu | alive=%u fired=%u | avg_act=%.4f | "
           "phase=%d | exc=%.2f | born=%u dead=%u",
           (unsigned long)s->tick, s->alive_count, s->fired_count,
           s->avg_activation, s->phase, s->exc_ratio,
           s->born_count, s->dead_count);
    if (ctx->bloom) {
        fprintf(stderr, " | bloom=%lu", (unsigned long)ctx->bloom->insert_count);
    }
    fprintf(stderr, "
");
    neuromod_print(s);
}
