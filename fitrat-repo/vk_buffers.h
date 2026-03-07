/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_VK_BUFFERS_H
#define FITRAT_VK_BUFFERS_H

#include <stdint.h>
#include "vk_init.h"

#ifdef __cplusplus
extern "C" {
#endif

/*
 * NeuronGPU: GLSL 450 bridge type
 * 
 * GLSL 450 does not support 8-bit/16-bit storage without extensions.
 * We bridge the 8-byte C99 Neuron struct to GPU as uvec2 (two uint32s).
 * Shader uses bit shifts to pack/unpack fields.
 * 
 * Total size: exactly 8 bytes to match GLSL uvec2 for SSBO alignment.
 */
typedef struct {
    uint32_t data[2];  /* 8 bytes total, maps to GLSL uvec2 */
} NeuronGPU;

/* Compile-time verification of 8-byte packing */
_Static_assert(sizeof(NeuronGPU) == 8, "NeuronGPU must be exactly 8 bytes");

/*
 * BufferManager: Vulkan GPU memory container
 * 
 * Holds the storage buffer handle and its backing device memory
 * for the neuron SSBO. Immutable after creation (no defrag).
 */
typedef struct {
    VkBuffer        buffer;   /* Storage buffer handle */
    VkDeviceMemory  memory;   /* Dedicated device memory */
    uint32_t        count;    /* Number of neurons allocated */
} BufferManager;

/* Create a storage buffer for 'count' neurons (8 bytes each) */
VkResult create_neuron_buffer(VkDevice device, VkPhysicalDeviceMemoryProperties mem_props,
                              uint32_t count, BufferManager *out_manager);

/* Destroy buffer and free device memory */
void destroy_buffer(VkDevice device, BufferManager *manager);

#ifdef __cplusplus
}
#endif

#endif /* FITRAT_VK_BUFFERS_H */
