/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * synapse_table.h — Fıtrat AI — Sinaptik Ağırlık Tablosu
 *
 * STDP ile öğrenilen sinaptik ağırlık delta değerlerini saklar.
 * Open-addressing hash table — (pre_id, post_id) → weight_delta
 *
 * Propagation sırasında: w = base_hash_weight + table_delta
 * STDP sırasında: table_delta += dw
 */

#ifndef FITRAT_SYNAPSE_TABLE_H
#define FITRAT_SYNAPSE_TABLE_H

#include <stdint.h>

#define SYNAPSE_TABLE_INITIAL_SLOTS  (1u << 20)  /* 1M slots (~32 MB) */
#define SYNAPSE_TABLE_LOAD_FACTOR    0.7f
#define SYNAPSE_TABLE_MAGIC          0x46535931u  /* "FSY1" */

/* Tek bir sinaps kaydı */
typedef struct {
    uint32_t pre_id;
    uint32_t post_id;
    float    weight_delta;  /* base ağırlığa eklenen delta */
    uint32_t last_tick;     /* son güncelleme tick'i */
} SynapseEntry;

/* Hash tablosu */
typedef struct {
    SynapseEntry *entries;
    uint32_t      capacity;   /* toplam slot sayısı (2^n) */
    uint32_t      count;      /* dolu slot sayısı */
    uint32_t      mask;       /* capacity - 1 */
} SynapseTable;

/* Oluştur — boş tablo */
SynapseTable *synapse_table_create(uint32_t initial_slots);

/* Yok et */
void synapse_table_destroy(SynapseTable *st);

/* Ağırlık delta oku — yoksa NaN döner */
float synapse_table_get(SynapseTable *st, uint32_t pre_id, uint32_t post_id);

/* Ağırlık delta güncelle (mevcut += dw) */
void synapse_table_update(SynapseTable *st, uint32_t pre_id, uint32_t post_id,
                          float dw, uint64_t tick);

/* Dosyadan yükle — başarısızsa NULL */
SynapseTable *synapse_table_load(const char *path);

/* Dosyaya kaydet */
void synapse_table_save(SynapseTable *st, const char *path);

/* İstatistik yazdır */
void synapse_table_stats(SynapseTable *st);

#endif /* FITRAT_SYNAPSE_TABLE_H */
