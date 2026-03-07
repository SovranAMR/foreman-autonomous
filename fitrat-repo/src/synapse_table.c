/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * synapse_table.c — Fıtrat AI — Sinaptik Ağırlık Tablosu
 *
 * Open-addressing hash table (linear probing).
 * Boş slot: pre_id == 0 && post_id == 0
 * Hash: FNV-1a bazlı
 */

#include "synapse_table.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

/* ─── Hash ─── */
static uint32_t synapse_hash(uint32_t pre, uint32_t post) {
    uint64_t key = ((uint64_t)pre << 32) | (uint64_t)post;
    /* FNV-1a 64-bit, sonra fold to 32 */
    uint64_t h = 14695981039346656037ULL;
    for (int i = 0; i < 8; i++) {
        h ^= (key & 0xFF);
        h *= 1099511628211ULL;
        key >>= 8;
    }
    return (uint32_t)(h ^ (h >> 32));
}

static int slot_empty(const SynapseEntry *e) {
    return (e->pre_id == 0 && e->post_id == 0);
}

/* ─── Create ─── */
SynapseTable *synapse_table_create(uint32_t initial_slots) {
    /* Round up to power of 2 */
    uint32_t cap = 1;
    while (cap < initial_slots) cap <<= 1;

    SynapseTable *st = (SynapseTable *)calloc(1, sizeof(SynapseTable));
    if (!st) return NULL;

    st->entries = (SynapseEntry *)calloc(cap, sizeof(SynapseEntry));
    if (!st->entries) { free(st); return NULL; }

    st->capacity = cap;
    st->count = 0;
    st->mask = cap - 1;
    return st;
}

/* ─── Destroy ─── */
void synapse_table_destroy(SynapseTable *st) {
    if (!st) return;
    free(st->entries);
    free(st);
}

/* ─── Rehash (grow) ─── */
static void synapse_table_grow(SynapseTable *st) {
    uint32_t old_cap = st->capacity;
    SynapseEntry *old = st->entries;

    uint32_t new_cap = old_cap << 1;
    SynapseEntry *new_entries = (SynapseEntry *)calloc(new_cap, sizeof(SynapseEntry));
    if (!new_entries) return;  /* keep old — degrade gracefully */

    uint32_t new_mask = new_cap - 1;

    for (uint32_t i = 0; i < old_cap; i++) {
        if (slot_empty(&old[i])) continue;
        uint32_t idx = synapse_hash(old[i].pre_id, old[i].post_id) & new_mask;
        while (!slot_empty(&new_entries[idx])) {
            idx = (idx + 1) & new_mask;
        }
        new_entries[idx] = old[i];
    }

    free(old);
    st->entries = new_entries;
    st->capacity = new_cap;
    st->mask = new_mask;
}

/* ─── Get ─── */
float synapse_table_get(SynapseTable *st, uint32_t pre_id, uint32_t post_id) {
    if (!st) return __builtin_nanf("");

    uint32_t idx = synapse_hash(pre_id, post_id) & st->mask;
    uint32_t start = idx;

    do {
        SynapseEntry *e = &st->entries[idx];
        if (slot_empty(e)) return __builtin_nanf("");
        if (e->pre_id == pre_id && e->post_id == post_id)
            return e->weight_delta;
        idx = (idx + 1) & st->mask;
    } while (idx != start);

    return __builtin_nanf("");
}

/* ─── Update ─── */
void synapse_table_update(SynapseTable *st, uint32_t pre_id, uint32_t post_id,
                          float dw, uint64_t tick) {
    if (!st) return;
    /* Prevent (0,0) key — reserved as empty marker */
    if (pre_id == 0 && post_id == 0) return;

    /* Check load factor */
    if ((float)st->count / (float)st->capacity > SYNAPSE_TABLE_LOAD_FACTOR) {
        synapse_table_grow(st);
    }

    uint32_t idx = synapse_hash(pre_id, post_id) & st->mask;
    uint32_t start = idx;

    do {
        SynapseEntry *e = &st->entries[idx];
        if (slot_empty(e)) {
            /* Insert new */
            e->pre_id = pre_id;
            e->post_id = post_id;
            e->weight_delta = dw;
            e->last_tick = (uint32_t)(tick & 0xFFFFFFFF);
            st->count++;
            return;
        }
        if (e->pre_id == pre_id && e->post_id == post_id) {
            /* Update existing — accumulate delta */
            e->weight_delta += dw;
            /* Clamp to [-1, +1] */
            if (e->weight_delta > 1.0f) e->weight_delta = 1.0f;
            if (e->weight_delta < -1.0f) e->weight_delta = -1.0f;
            e->last_tick = (uint32_t)(tick & 0xFFFFFFFF);
            return;
        }
        idx = (idx + 1) & st->mask;
    } while (idx != start);

    /* Table full — should not happen with load factor check */
    fprintf(stderr, "[SYNAPSE] ERROR: table full!
");
}

/* ─── Save ─── */
void synapse_table_save(SynapseTable *st, const char *path) {
    if (!st || !path) return;

    FILE *f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "[SYNAPSE] Cannot save to %s
", path);
        return;
    }

    uint32_t magic = SYNAPSE_TABLE_MAGIC;
    fwrite(&magic, 4, 1, f);
    fwrite(&st->count, 4, 1, f);

    uint32_t written = 0;
    for (uint32_t i = 0; i < st->capacity; i++) {
        if (slot_empty(&st->entries[i])) continue;
        fwrite(&st->entries[i], sizeof(SynapseEntry), 1, f);
        written++;
    }

    fclose(f);
    fprintf(stderr, "[SYNAPSE] Saved %u synapses to %s
", written, path);
}

/* ─── Load ─── */
SynapseTable *synapse_table_load(const char *path) {
    if (!path) return NULL;

    FILE *f = fopen(path, "rb");
    if (!f) return NULL;

    uint32_t magic, count;
    if (fread(&magic, 4, 1, f) != 1 || magic != SYNAPSE_TABLE_MAGIC) {
        fclose(f);
        return NULL;
    }
    if (fread(&count, 4, 1, f) != 1) {
        fclose(f);
        return NULL;
    }

    /* Allocate table with room */
    uint32_t needed = count * 2;
    if (needed < SYNAPSE_TABLE_INITIAL_SLOTS) needed = SYNAPSE_TABLE_INITIAL_SLOTS;
    SynapseTable *st = synapse_table_create(needed);
    if (!st) { fclose(f); return NULL; }

    SynapseEntry entry;
    uint32_t loaded = 0;
    for (uint32_t i = 0; i < count; i++) {
        if (fread(&entry, sizeof(SynapseEntry), 1, f) != 1) break;
        if (slot_empty(&entry)) continue;

        /* Insert directly */
        uint32_t idx = synapse_hash(entry.pre_id, entry.post_id) & st->mask;
        while (!slot_empty(&st->entries[idx])) {
            idx = (idx + 1) & st->mask;
        }
        st->entries[idx] = entry;
        st->count++;
        loaded++;
    }

    fclose(f);
    fprintf(stderr, "[SYNAPSE] Loaded %u synapses from %s
", loaded, path);
    return st;
}

/* ─── Stats ─── */
void synapse_table_stats(SynapseTable *st) {
    if (!st) return;

    float avg_delta = 0.0f;
    float max_delta = 0.0f;
    float min_delta = 0.0f;
    uint32_t pos_count = 0, neg_count = 0;

    for (uint32_t i = 0; i < st->capacity; i++) {
        if (slot_empty(&st->entries[i])) continue;
        float d = st->entries[i].weight_delta;
        avg_delta += d;
        if (d > max_delta) max_delta = d;
        if (d < min_delta) min_delta = d;
        if (d > 0) pos_count++;
        else neg_count++;
    }

    if (st->count > 0) avg_delta /= (float)st->count;

    fprintf(stderr, "[SYNAPSE] count=%u cap=%u load=%.2f%% avg=%.4f min=%.4f max=%.4f pos=%u neg=%u
",
            st->count, st->capacity,
            100.0f * (float)st->count / (float)st->capacity,
            avg_delta, min_delta, max_delta, pos_count, neg_count);
}
