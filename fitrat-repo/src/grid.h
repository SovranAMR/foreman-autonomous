/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * grid.h — Spatial Hash Grid (Morton Code Edition)
 *
 * 3D uzayı sabit boyutlu hücrelere böler. Her hücre o bölgedeki nöron
 * ID'lerini tutar. Komşu nöron araması O(1) — sadece bitişik hücrelere bak.
 *
 * Morton codes ile koordinatlar ID'den çıkarılır — sıfır ek bellek.
 */

#ifndef FITRAT_GRID_H
#define FITRAT_GRID_H

#include "neuron.h"
#include "morton.h"
#include <stdint.h>
#include <stdlib.h>

/* Grid hücre anahtarı: (cx, cy, cz) → tek uint32 */
static inline uint32_t grid_key(uint16_t cx, uint16_t cy, uint8_t cz) {
    return ((uint32_t)cx << 16) | ((uint32_t)cy << 4) | (uint32_t)cz;
}

/* Grid hücre girişi: nöron ID'lerinin dinamik dizisi */
typedef struct {
    uint32_t *ids;       /* nöron ID dizisi */
    uint32_t  count;     /* mevcut eleman sayısı */
    uint32_t  capacity;  /* ayrılmış kapasite */
} GridCell;

/* Hash map girişi */
typedef struct GridEntry {
    uint32_t          key;
    GridCell          cell;
    struct GridEntry *next;  /* chaining for collision */
} GridEntry;

/* Spatial Hash Grid */
typedef struct {
    GridEntry **buckets;
    uint32_t    bucket_count;
    uint32_t    entry_count;
} SpatialGrid;

/* === API === */

/* Grid oluştur */
SpatialGrid *grid_create(uint32_t bucket_count);

/* Grid yok et */
void grid_destroy(SpatialGrid *grid);

/* Tüm hücreleri temizle */
void grid_clear(SpatialGrid *grid);

/* Nöron ekle (Morton ID'den koordinat çıkarır) */
void grid_insert(SpatialGrid *grid, uint32_t neuron_id);

/* Nöron sil */
void grid_remove(SpatialGrid *grid, uint32_t neuron_id);

/* Belirli hücredeki nöronları getir */
GridCell *grid_get_cell(SpatialGrid *grid, uint16_t cx, uint16_t cy, uint8_t cz);

/* Komşu hücrelerdeki tüm nöron ID'lerini topla (3x3x3 = 27 hücre) */
uint32_t grid_get_neighbors(SpatialGrid *grid,
                            uint16_t cx, uint16_t cy, uint8_t cz,
                            uint32_t *out_ids, uint32_t max_ids);

/* Grid istatistikleri */
void grid_stats(SpatialGrid *grid, uint32_t *out_cells, uint32_t *out_neurons);

/* Tüm canlı nöronlardan grid'i yeniden inşa et */
void grid_rebuild(SpatialGrid *grid, const Neuron *neurons,
                  const uint32_t *id_list, uint32_t count);

#endif /* FITRAT_GRID_H */
