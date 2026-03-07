/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#ifndef FITRAT_VK_INIT_H
#define FITRAT_VK_INIT_H

#include <vulkan/vulkan.h>
#include <stdint.h>

/*
 * FitratContext: Vulkan handle container for Fıtrat2 brain simulation.
 * 
 * Contains all Vulkan objects needed for compute operations.
 * Note: This struct is ~40 bytes (4×64-bit handles + 32-bit index + padding),
 * designed for cache-friendly access patterns, not to be confused with the
 * 8-byte packed Neuron struct used for GPU memory efficiency.
 */
typedef struct {
    VkInstance instance;           /* Vulkan instance handle */
    VkPhysicalDevice phys_device;  /* Selected GPU (AMD preferred) */
    VkDevice device;               /* Logical device for compute */
    VkQueue compute_queue;         /* Compute command submission queue */
    uint32_t queue_family;         /* Queue family index for compute */
} FitratContext;

/* Initialize Vulkan 1.2 compute context. Returns 0 on success, non-zero on error. */
int fitrat_vk_init(FitratContext* ctx);

/* Cleanup all Vulkan resources in context. */
void fitrat_vk_cleanup(FitratContext* ctx);

/* Select AMD GPU if available, otherwise fall back to first discrete GPU. 
 * Returns VK_SUCCESS on success. */
VkResult fitrat_select_amd_device(VkInstance instance, VkPhysicalDevice* out_device);

#endif /* FITRAT_VK_INIT_H */
