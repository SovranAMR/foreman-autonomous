/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_IO_H
#define FITRAT_IO_H

#include "neuron.h"
#include "learning.h"
#include <stdint.h>

/* Girdi enjeksiyonu — population stimulation */
uint32_t io_inject_text(Neuron *neurons, const uint32_t *active_ids,
                         uint32_t count, const char *text, uint32_t text_len);

/* Çıktı okuma — temporal population decoding */
uint32_t io_read_output(const Neuron *neurons, const uint32_t *active_ids,
                         uint32_t count, char *out_buf, uint32_t buf_size,
                         const SpikeRecord *spike_records, uint64_t current_tick);

/* Autoregressive re-enjeksiyon */
uint32_t io_reinject_output(Neuron *neurons, const uint32_t *active_ids,
                             uint32_t count, const char *prev_output,
                             uint32_t prev_len);

/* Temporal tek karakter öğretme */
uint32_t io_teach_char(Neuron *neurons, const uint32_t *active_ids,
                        uint32_t count, char target_char,
                        int char_index, int total_chars,
                        SpikeRecord *spike_records, uint64_t current_tick);

/* Toplu temporal teach — yeni ana API */
uint32_t io_teach_temporal(Neuron *neurons, const uint32_t *active_ids,
                            uint32_t count, const char *target, uint32_t target_len,
                            SpikeRecord *spike_records, uint64_t current_tick);

/* Eski teach API (temporal bilgi yok) */
uint32_t io_teach_target(Neuron *neurons, const uint32_t *active_ids,
                          uint32_t count, const char *target, uint32_t target_len);

/* Yanlış karakterleri bastır */
uint32_t io_suppress_wrong(Neuron *neurons, const uint32_t *active_ids,
                            uint32_t count, const char *target, uint32_t target_len);

/* Aktivite haritası yazdır */
void io_print_activity_map(const Neuron *neurons, const uint32_t *active_ids,
                            uint32_t count, uint32_t width);

#endif

/* Free recall — teach_active olmadan doğal output oku */
uint32_t io_read_output_free(const Neuron *neurons, const uint32_t *active_ids,
                              uint32_t count, char *out_buf, uint32_t buf_size,
                              const SpikeRecord *spike_records, uint64_t current_tick);

/* Tek karakter enjeksiyonu — sıralı stimulus için */
uint32_t io_inject_char(Neuron *neurons, const uint32_t *active_ids,
                         uint32_t count, char c);
