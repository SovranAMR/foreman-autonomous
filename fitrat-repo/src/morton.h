/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * morton.h — Morton Code (Z-Order Curve) Encoding/Decoding
 *
 * Nöron ID = 3D koordinatın Z-order curve encoding'i.
 * ID'den pozisyon çıkarmak: bit de-interleave (5 ALU cycle, sıfır memory).
 * Pozisyon array'i saklamaya GEREK YOK.
 *
 * Encoding: (x, y, z) → uint32_t morton code
 * X: 12 bit (0-4095), Y: 12 bit (0-4095), Z: 8 bit (0-255)
 * Total: 32 bit (12+12+8 = 32)
 *
 * Bit layout:
 *   X bits interleaved in positions 0, 3, 6, 9, ...
 *   Y bits interleaved in positions 1, 4, 7, 10, ...
 *   Z bits interleaved in positions 2, 5, 8, 11, ... (only 8 bits)
 *
 * For simplicity and max perf, we use a compact scheme:
 *   ID bits [31:20] = X (12 bits)
 *   ID bits [19:8]  = Y (12 bits)
 *   ID bits [7:0]   = Z (8 bits)
 * This isn't true Morton interleaving but gives us:
 *   - ID → position: 3 shifts + 3 masks (< 5 ALU cycles)
 *   - Position → ID: 3 shifts + 3 ORs
 *   - Spatial locality preserved at Z-layer level
 *   - Z as LSB means neurons in same vertical column are adjacent in memory
 */

#ifndef FITRAT_MORTON_H
#define FITRAT_MORTON_H

#include <stdint.h>

/* === Compact Morton Encoding === */

/* Encode (x, y, z) → neuron ID */
static inline uint32_t morton_encode(uint16_t x, uint16_t y, uint8_t z) {
    return ((uint32_t)(x & 0xFFF) << 20) |
           ((uint32_t)(y & 0xFFF) << 8)  |
           (uint32_t)z;
}

/* Decode neuron ID → x (12 bits, 0-4095) */
static inline uint16_t morton_x(uint32_t id) {
    return (uint16_t)((id >> 20) & 0xFFF);
}

/* Decode neuron ID → y (12 bits, 0-4095) */
static inline uint16_t morton_y(uint32_t id) {
    return (uint16_t)((id >> 8) & 0xFFF);
}

/* Decode neuron ID → z (8 bits, 0-255) */
static inline uint8_t morton_z(uint32_t id) {
    return (uint8_t)(id & 0xFF);
}

/* Distance between two neuron IDs (decoded from Morton) */
static inline float morton_distance(uint32_t a, uint32_t b) {
    float dx = (float)morton_x(a) - (float)morton_x(b);
    float dy = (float)morton_y(a) - (float)morton_y(b);
    float dz = (float)morton_z(a) - (float)morton_z(b);
    /* Fast approximate: Manhattan or squared Euclidean to avoid sqrt */
    return dx*dx + dy*dy + dz*dz;  /* squared distance — caller does sqrt if needed */
}

/* Squared distance (no sqrt) for threshold comparisons */
static inline float morton_distance_sq(uint32_t a, uint32_t b) {
    float dx = (float)morton_x(a) - (float)morton_x(b);
    float dy = (float)morton_y(a) - (float)morton_y(b);
    float dz = (float)morton_z(a) - (float)morton_z(b);
    return dx*dx + dy*dy + dz*dz;
}

/* Max possible neuron count with this encoding */
#define MORTON_MAX_NEURONS  ((uint32_t)4096 * 4096 * 256)  /* ~4.29 billion */
#define MORTON_MAX_X        4095u
#define MORTON_MAX_Y        4095u
#define MORTON_MAX_Z        255u

/* Grid cell from Morton ID (for spatial hash) */
#define MORTON_GRID_SHIFT_XY  4   /* 16 positions per grid cell */
#define MORTON_GRID_SHIFT_Z   4

static inline uint16_t morton_grid_cx(uint32_t id) {
    return morton_x(id) >> MORTON_GRID_SHIFT_XY;
}
static inline uint16_t morton_grid_cy(uint32_t id) {
    return morton_y(id) >> MORTON_GRID_SHIFT_XY;
}
static inline uint8_t morton_grid_cz(uint32_t id) {
    return morton_z(id) >> MORTON_GRID_SHIFT_Z;
}

#endif /* FITRAT_MORTON_H */
