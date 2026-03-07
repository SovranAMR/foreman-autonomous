/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef MORTON_H
#define MORTON_H

#include <stdint.h>

/* Neuron ID IS the Morton code - position requires zero memory storage */

uint32_t morton_encode_3d(uint16_t x, uint16_t y, uint16_t z);
void morton_decode_3d(uint32_t code, uint16_t* x, uint16_t* y, uint16_t* z);

#endif /* MORTON_H */
