/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*
 * morton.c - 3D Morton code (Z-order curve) encoding/decoding
 * 
 * Fıtrat AI v2 - Spatial indexing without storage
 * 
 * Neuron ID IS position. No separate coordinate arrays.
 * 10 bits per dimension = 1024³ = 1B unique positions.
 * 500M neurons fit comfortably with spatial locality preserved.
 * 
 * Magic number bit interleaving: ~15 ALU ops on RDNA2.
 * No LUTs, no cache pressure, just raw bit manipulation.
 */

#include <stdint.h>
#include "morton.h"

/*
 * morton_encode_3d - Interleave 10-bit x,y,z into 30-bit Morton code
 * 
 * Uses magic number multiplication for bit expansion:
 * 0x09249249 = 0b00001001001001001001001001001
 * 0x30C30C3  = 0b0011000011000011000011000011
 * 
 * Valid input range: 0-1023 for each coordinate.
 * Values > 1023 will corrupt neighboring bit fields.
 */
uint32_t morton_encode_3d(uint16_t x, uint16_t y, uint16_t z) {
    /* Mask to 10 bits - enforce valid range */
    x &= 0x3FF;
    y &= 0x3FF;
    z &= 0x3FF;
    
    /* Expand 10 bits to 30 with 2 zeros between each */
    /* Magic: multiply spreads bits, mask isolates them */
    uint32_t x_expanded = ((uint32_t)(x) * 0x09249249u) & 0x30C30C3u;
    uint32_t y_expanded = ((uint32_t)(y) * 0x09249249u) & 0x30C30C3u;
    uint32_t z_expanded = ((uint32_t)(z) * 0x09249249u) & 0x30C30C3u;
    
    /* Interleave: x bits at positions 0,3,6... y at 1,4,7... z at 2,5,8... */
    return x_expanded | (y_expanded << 1) | (z_expanded << 2);
}

/*
 * morton_decode_3d - Extract x,y,z from 30-bit Morton code
 * 
 * De-interleave by extracting every 3rd bit.
 * Uses progressive unshuffle: 000a000b000c -> 00ab00cd00ef -> 0abcdef0...
 * 
 * Output range: 0-1023 for each coordinate.
 */
void morton_decode_3d(uint32_t code, uint16_t *x, uint16_t *y, uint16_t *z) {
    /* Extract each coordinate's bits */
    /* x: bits 0, 3, 6, 9, 12, 15, 18, 21, 24, 27 */
    /* y: bits 1, 4, 7, 10, 13, 16, 19, 22, 25, 28 */
    /* z: bits 2, 5, 8, 11, 14, 17, 20, 23, 26, 29 */
    
    uint32_t x_bits = code & 0x09249249u;
    uint32_t y_bits = (code >> 1) & 0x09249249u;
    uint32_t z_bits = (code >> 2) & 0x09249249u;
    
    /* Compact the spread bits back to contiguous form */
    /* Reverse the magic multiplication through bit shifting */
    
    /* Phase 1: 000a000b000c000d -> 00ab00cd00ef00gh */
    x_bits = (x_bits | (x_bits >> 2)) & 0x030C30C3u;
    y_bits = (y_bits | (y_bits >> 2)) & 0x030C30C3u;
    z_bits = (z_bits | (z_bits >> 2)) & 0x030C30C3u;
    
    /* Phase 2: 00ab00cd00ef00gh -> 0abcd0ef0ghi0hij */
    x_bits = (x_bits | (x_bits >> 4)) & 0x0300F00Fu;
    y_bits = (y_bits | (y_bits >> 4)) & 0x0300F00Fu;
    z_bits = (z_bits | (z_bits >> 4)) & 0x0300F00Fu;
    
    /* Phase 3: Final compaction to 10 bits */
    x_bits = (x_bits | (x_bits >> 8)) & 0x03F0003Fu;
    y_bits = (y_bits | (y_bits >> 8)) & 0x03F0003Fu;
    z_bits = (z_bits | (z_bits >> 8)) & 0x03F0003Fu;
    
    /* Final shift to align bits 0-9 */
    *x = (uint16_t)((x_bits | (x_bits >> 16)) & 0x3FF);
    *y = (uint16_t)((y_bits | (y_bits >> 16)) & 0x3FF);
    *z = (uint16_t)((z_bits | (z_bits >> 16)) & 0x3FF);
}
