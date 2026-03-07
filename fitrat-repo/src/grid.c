/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * grid.c — Spatial Hash Grid Implementation (Morton Code Edition)
 *
 * Chained hash map. Grid hücreleri nöron ID'lerini dinamik dizi olarak tutar.
 * Koordinatlar Morton ID'den çıkarılır — ek bellek yok.
 */

#include "grid.h"
#include <string.h>
#include <stdio.h>

/* --- Internal --- */

static uint32_t grid_hash(uint32_t key, uint32_t bucket_count) {
    /* splitmix32 finalize */
    key ^= key >> 16;
    key *= 0x45D9F3Bu;
    key ^= key >> 16;
    return key % bucket_count;
}

static GridEntry *find_entry(SpatialGrid *grid, uint32_t key) {
    uint32_t idx = grid_hash(key, grid->bucket_count);
    GridEntry *e = grid->buckets[idx];
    while (e) {
        if (e->key == key) return e;
        e = e->next;
    }
    return NULL;
}

static GridEntry *find_or_create(SpatialGrid *grid, uint32_t key) {
    uint32_t idx = grid_hash(key, grid->bucket_count);
    GridEntry *e = grid->buckets[idx];
    while (e) {
        if (e->key == key) return e;
        e = e->next;
    }
    e = (GridEntry *)calloc(1, sizeof(GridEntry));
    if (!e) return NULL;
    e->key = key;
    e->next = grid->buckets[idx];
    grid->buckets[idx] = e;
    grid->entry_count++;
    return e;
}

static void cell_add(GridCell *cell, uint32_t id) {
    if (cell->count >= cell->capacity) {
        uint32_t new_cap = cell->capacity ? cell->capacity * 2 : 8;
        uint32_t *new_ids = (uint32_t *)realloc(cell->ids, new_cap * sizeof(uint32_t));
        if (!new_ids) return;
        cell->ids = new_ids;
        cell->capacity = new_cap;
    }
    cell->ids[cell->count++] = id;
}

static void cell_remove(GridCell *cell, uint32_t id) {
    for (uint32_t i = 0; i < cell->count; i++) {
        if (cell->ids[i] == id) {
            cell->ids[i] = cell->ids[--cell->count];
            return;
        }
    }
}

/* --- Public API --- */

SpatialGrid *grid_create(uint32_t bucket_count) {
    SpatialGrid *g = (SpatialGrid *)calloc(1, sizeof(SpatialGrid));
    if (!g) return NULL;
    g->bucket_count = bucket_count;
    g->buckets = (GridEntry **)calloc(bucket_count, sizeof(GridEntry *));
    if (!g->buckets) { free(g); return NULL; }
    g->entry_count = 0;
    return g;
}

void grid_destroy(SpatialGrid *grid) {
    if (!grid) return;
    for (uint32_t i = 0; i < grid->bucket_count; i++) {
        GridEntry *e = grid->buckets[i];
        while (e) {
            GridEntry *next = e->next;
            free(e->cell.ids);
            free(e);
            e = next;
        }
    }
    free(grid->buckets);
    free(grid);
}

void grid_clear(SpatialGrid *grid) {
    for (uint32_t i = 0; i < grid->bucket_count; i++) {
        GridEntry *e = grid->buckets[i];
        while (e) {
            GridEntry *next = e->next;
            free(e->cell.ids);
            free(e);
            e = next;
        }
        grid->buckets[i] = NULL;
    }
    grid->entry_count = 0;
}

void grid_insert(SpatialGrid *grid, uint32_t neuron_id) {
    uint16_t cx = morton_grid_cx(neuron_id);
    uint16_t cy = morton_grid_cy(neuron_id);
    uint8_t  cz = morton_grid_cz(neuron_id);
    uint32_t key = grid_key(cx, cy, cz);
    GridEntry *e = find_or_create(grid, key);
    if (e) cell_add(&e->cell, neuron_id);
}

void grid_remove(SpatialGrid *grid, uint32_t neuron_id) {
    uint16_t cx = morton_grid_cx(neuron_id);
    uint16_t cy = morton_grid_cy(neuron_id);
    uint8_t  cz = morton_grid_cz(neuron_id);
    uint32_t key = grid_key(cx, cy, cz);
    GridEntry *e = find_entry(grid, key);
    if (e) cell_remove(&e->cell, neuron_id);
}

GridCell *grid_get_cell(SpatialGrid *grid, uint16_t cx, uint16_t cy, uint8_t cz) {
    GridEntry *e = find_entry(grid, grid_key(cx, cy, cz));
    return e ? &e->cell : NULL;
}

uint32_t grid_get_neighbors(SpatialGrid *grid,
                            uint16_t cx, uint16_t cy, uint8_t cz,
                            uint32_t *out_ids, uint32_t max_ids) {
    uint32_t total = 0;
    for (int dz = -1; dz <= 1; dz++) {
        int nz = (int)cz + dz;
        if (nz < 0 || nz > 15) continue; /* max grid_cz = 255/16 = 15 */
        for (int dy = -1; dy <= 1; dy++) {
            int ny = (int)cy + dy;
            if (ny < 0 || ny > 255) continue; /* max grid_cy = 4095/16 = 255 */
            for (int dx = -1; dx <= 1; dx++) {
                int nx = (int)cx + dx;
                if (nx < 0 || nx > 255) continue;
                GridCell *c = grid_get_cell(grid, (uint16_t)nx,
                                            (uint16_t)ny, (uint8_t)nz);
                if (!c) continue;
                for (uint32_t i = 0; i < c->count && total < max_ids; i++) {
                    out_ids[total++] = c->ids[i];
                }
            }
        }
    }
    return total;
}

void grid_stats(SpatialGrid *grid, uint32_t *out_cells, uint32_t *out_neurons) {
    uint32_t cells = 0, neurons = 0;
    for (uint32_t i = 0; i < grid->bucket_count; i++) {
        GridEntry *e = grid->buckets[i];
        while (e) {
            cells++;
            neurons += e->cell.count;
            e = e->next;
        }
    }
    if (out_cells) *out_cells = cells;
    if (out_neurons) *out_neurons = neurons;
}

void grid_rebuild(SpatialGrid *grid, const Neuron *neurons,
                  const uint32_t *id_list, uint32_t count) {
    grid_clear(grid);
    for (uint32_t i = 0; i < count; i++) {
        uint32_t nid = id_list[i];
        if (NEURON_IS_ALIVE(neurons[nid])) {
            grid_insert(grid, nid);
        }
    }
}
