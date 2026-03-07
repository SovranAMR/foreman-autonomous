/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * neuron.h — Fıtrat AI v2 Nöron Yapısı (Morton Code Edition)
 *
 * Her nöron tam 8 byte packed struct:
 *   flags (uint8): tip + durum bit field'ları
 *   activation (uint8): anlık aktivasyon [0-255] → [0.0-1.0]
 *   threshold (uint8): ateşleme eşiği [0-255] → [0.0-2.0]
 *   ema (uint8): üstel hareketli ortalama aktivasyon
 *   modulator (uint8): per-nöron plastisite modifier
 *   dna_extra (uint8): mutation_rate(4) + max_inactivity_class(2) + reserved(2)
 *   last_fire_dt (uint16): son ateşlemeden bu yana geçen tick (STDP window, max 65535)
 *
 * POZİSYON SAKLANMIYOR: Nöron ID = Morton code = pozisyon.
 *   morton_x(id) → X koordinatı (12 bit, 0-4095)
 *   morton_y(id) → Y koordinatı (12 bit, 0-4095)
 *   morton_z(id) → Z derinlik (8 bit, 0=girdi, 127=orta, 255=çıktı)
 *
 * Fıtrat ilkesi: "Her hücre doğuştan farklı" — DNA flags + threshold + modulator
 */

#ifndef FITRAT_NEURON_H
#define FITRAT_NEURON_H

#include <stdint.h>
#include <stdio.h>

/* === Packed Neuron Struct (8 bytes) === */
#pragma pack(push, 1)
typedef struct {
    uint8_t  flags;        /* Bit field: tip, durum, DNA özellikleri */
    uint8_t  activation;   /* Anlık aktivasyon: val/255.0 → [0.0, 1.0] */
    uint8_t  threshold;    /* Ateşleme eşiği: val/127.5 → [0.0, 2.0] */
    uint8_t  ema;          /* Üstel hareketli ortalama aktivasyon */
    uint8_t  modulator;    /* Per-nöron plastisite çarpanı: val/128.0 → [0.0, 2.0) */
    uint8_t  dna_extra;    /* Mutation(4) + inactivity_class(2) + reserved(2) */
    uint16_t last_fire_dt; /* Tick since last fire (STDP timing, saturates at 65535) */
} __attribute__((packed)) Neuron;
#pragma pack(pop)

_Static_assert(sizeof(Neuron) == 8, "Neuron struct must be exactly 8 bytes");

/* === Flags Bit Field === */
/*
 * Bit 7 (MSB): Tip — 0=excitatory, 1=inhibitory
 * Bit 6:       can_reproduce — 0=hayır, 1=evet
 * Bit 5:       is_alive — 0=ölü (slot boş), 1=yaşıyor
 * Bit 4:       fired_this_tick — 0=hayır, 1=ateşledi
 * Bit 3-2:     plasticity_class — 00=low, 01=medium, 10=high, 11=frozen
 * Bit 1-0:     layer_hint — 00=input, 01=lower-mid, 10=upper-mid, 11=output
 */
#define FLAG_INHIBITORY      (1u << 7)
#define FLAG_CAN_REPRODUCE   (1u << 6)
#define FLAG_ALIVE           (1u << 5)
#define FLAG_FIRED           (1u << 4)
#define FLAG_PLASTICITY_MASK (3u << 2)
#define FLAG_PLASTICITY_LOW  (0u << 2)
#define FLAG_PLASTICITY_MED  (1u << 2)
#define FLAG_PLASTICITY_HIGH (2u << 2)
#define FLAG_PLASTICITY_FROZEN (3u << 2)
#define FLAG_LAYER_MASK      (3u)
#define FLAG_LAYER_INPUT     0u
#define FLAG_LAYER_LOWER_MID 1u
#define FLAG_LAYER_UPPER_MID 2u
#define FLAG_LAYER_OUTPUT    3u

/* === DNA Extra Bit Field === */
/*
 * Bit 7-4: mutation_rate (0-15, maps to 0%-15%)
 * Bit 3-2: max_inactivity_class (00=short, 01=medium, 10=long, 11=immortal)
 * Bit 1-0: reserved
 */
#define DNA_MUTATION_MASK     (0xF0u)
#define DNA_MUTATION_SHIFT    4
#define DNA_INACTIVITY_MASK   (0x0Cu)
#define DNA_INACTIVITY_SHIFT  2

/* === Helper Macros === */
#define NEURON_IS_ALIVE(n)     ((n).flags & FLAG_ALIVE)
#define NEURON_IS_INHIBITORY(n) ((n).flags & FLAG_INHIBITORY)
#define NEURON_IS_EXCITATORY(n) (!((n).flags & FLAG_INHIBITORY))
#define NEURON_FIRED(n)        ((n).flags & FLAG_FIRED)
#define NEURON_CAN_REPRODUCE(n) ((n).flags & FLAG_CAN_REPRODUCE)

#define NEURON_PLASTICITY(n) (((n).flags & FLAG_PLASTICITY_MASK) >> 2)
#define NEURON_LAYER(n)      ((n).flags & FLAG_LAYER_MASK)

/* Aktivasyonu float'a çevir [0.0, 1.0] */
#define NEURON_ACT_F(n)   ((float)(n).activation / 255.0f)
/* Threshold'u float'a çevir [0.0, 2.0] */
#define NEURON_THR_F(n)   ((float)(n).threshold / 127.5f)
/* EMA'yı float'a çevir [0.0, 1.0] */
#define NEURON_EMA_F(n)   ((float)(n).ema / 255.0f)
/* Modulator'ü float'a çevir [0.0, 2.0) */
#define NEURON_MOD_F(n)   ((float)(n).modulator / 128.0f)

/* Float'tan uint8'e çevir */
#define F_TO_ACT(f)  ((uint8_t)((f) * 255.0f + 0.5f))
#define F_TO_THR(f)  ((uint8_t)((f) * 127.5f + 0.5f))
#define F_TO_EMA(f)  ((uint8_t)((f) * 255.0f + 0.5f))
#define F_TO_MOD(f)  ((uint8_t)((f) * 128.0f))

/* Mutation rate çıkar (0-15) */
#define NEURON_MUTATION_RATE(n) (((n).dna_extra & DNA_MUTATION_MASK) >> DNA_MUTATION_SHIFT)
/* Inactivity class (0-3) */
#define NEURON_INACTIVITY_CLASS(n) (((n).dna_extra & DNA_INACTIVITY_MASK) >> DNA_INACTIVITY_SHIFT)

/* === Neuromodülatör State (GPU Uniform) === */
typedef struct {
    float valence;      /* [-1.0, 1.0] duygu valansı */
    float arousal;      /* [0.0, 1.0] uyarılmışlık */
    float curiosity;    /* [0.0, 1.0] merak seviyesi */
    float learning_mod; /* [0.0, 2.0] öğrenme hızı çarpanı */
} NeuromodState;

/* === Simülasyon Sabitleri === */
#define DEFAULT_NEURON_COUNT   1000000u   /* 1M başlangıç, 500M hedef */
#define MAX_NEURON_COUNT       500000000u /* 500M üst limit */

#define ACTIVATION_DECAY_INT   235u  /* 235/256 ≈ 0.918 ≈ v1 0.92 */
#define EMA_ALPHA_INT          13u   /* 13/256 ≈ 0.05 */
#define TARGET_ACTIVATION_INT  26u   /* 26/256 ≈ 0.10 */
#define INTRINSIC_PLASTICITY_INT 1u  /* minimum step for threshold adaptation */

#define INHIBITORY_RATIO       0.20f
#define MAX_CONNECTIONS        7000u  /* max sinaps per nöron (hash ile) */
#define LOCAL_RADIUS           5u     /* spatial hash yerel bağlantı yarıçapı */
#define DISTANT_PROBABILITY    0.05f  /* uzak bağlantı olasılığı */

/* Zamanlama sabitleri */
#define REM_PERIOD             10000u  /* her 1000 tick'te REM */
#define REM_DURATION           50u   /* REM süresi: 500 tick */
#define EVOLUTION_PERIOD       10000u /* evrim her 10K tick'te */
#define CHECKPOINT_PERIOD      100000u /* checkpoint her 100K tick'te */

/* Grid sabitleri */
#define GRID_CELL_SIZE         16u    /* spatial hash hücre boyutu */

/* Hash seed'leri */
#define HASH_SEED_CONNECTIVITY 0xDEADBEEFu
#define HASH_SEED_WEIGHT       0xCAFEBABEu
#define HASH_SEED_DISTANT      0xF10A7002u  /* Fitrat seed */

/* Faz durumları */
typedef enum {
    PHASE_NORMAL = 0,
    PHASE_REM,
    PHASE_TAFAKKUR,    /* Tefekkür modu */
    PHASE_LEARNING,
    PHASE_CREATIVE,
    PHASE_ANALYTIC
} SimPhase;

/* Event buffer entry (ateşleyen nöron) */
typedef struct {
    uint32_t neuron_id;
    uint8_t  activation_at_fire;
    uint8_t  _pad[3];
} FireEvent;

/* Simülasyon global state */
typedef struct {
    uint64_t       tick;
    uint32_t       neuron_count;
    uint32_t       alive_count;
    uint32_t       fired_count;
    uint32_t       born_count;
    uint32_t       dead_count;
    SimPhase       phase;
    uint32_t       phase_tick;      /* faz içi sayaç */
    NeuromodState  neuromod;
    float          avg_activation;
    float          prev_avg_activation;
    float          novelty_ema;
    float          exc_ratio;       /* excitatory oranı */
} SimState;

#endif /* FITRAT_NEURON_H */
