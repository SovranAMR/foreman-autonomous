/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
/*  vk_buffers.c — 4GB SSBO allocation for 500M neurons
 *  
 *  Fıtrat v2: 500M neuron brain simulation
 *  Memory layout: 500M × 8B = 4GB device-local SSBO
 *  
 *  The neuron ID is its Morton code; position requires zero storage.
 *  Device-local memory ensures compute shaders access at peak bandwidth.
 */

#include <vulkan/vulkan.h>
#include <stdint.h>
#include "vk_buffers.h"
#include "neuron.h"

#define NEURON_COUNT 500000000ULL  /* 500M neurons */
#define BUFFER_SIZE (NEURON_COUNT * sizeof(Neuron))  /* 4GB */

/*  create_neuron_buffer — allocate 4GB device-local SSBO
 *  
 *  device:          Logical Vulkan device
 *  physical_device: For memory property queries
 *  out_buffer:      Output handle to created buffer
 *  out_memory:      Output handle to allocated device memory
 *  
 *  Returns VK_SUCCESS on success, error code on failure.
 *  
 *  Memory type selection prefers DEVICE_LOCAL (VRAM).
 *  Buffer usage allows compute shader storage and host transfer.
 */
VkResult create_neuron_buffer(VkDevice device,
                              VkPhysicalDevice physical_device,
                              VkBuffer *out_buffer,
                              VkDeviceMemory *out_memory) {
    /* Create buffer object */
    VkBufferCreateInfo buffer_info = {0};
    buffer_info.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    buffer_info.size = BUFFER_SIZE;
    buffer_info.usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | 
                        VK_BUFFER_USAGE_TRANSFER_DST_BIT;
    buffer_info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    
    VkBuffer buffer = VK_NULL_HANDLE;
    VkResult result = vkCreateBuffer(device, &buffer_info, NULL, &buffer);
    if (result != VK_SUCCESS) {
        return result;
    }
    
    /* Query memory requirements */
    VkMemoryRequirements mem_reqs;
    vkGetBufferMemoryRequirements(device, buffer, &mem_reqs);
    
    /* Find device-local memory type */
    VkPhysicalDeviceMemoryProperties mem_props;
    vkGetPhysicalDeviceMemoryProperties(physical_device, &mem_props);
    
    uint32_t memory_type_index = UINT32_MAX;
    for (uint32_t i = 0; i < mem_props.memoryTypeCount; i++) {
        if ((mem_reqs.memoryTypeBits & (1 << i)) && 
            (mem_props.memoryTypes[i].propertyFlags & 
             VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)) {
            memory_type_index = i;
            break;
        }
    }
    
    if (memory_type_index == UINT32_MAX) {
        vkDestroyBuffer(device, buffer, NULL);
        return VK_ERROR_MEMORY_MAP_FAILED;
    }
    
    /* Allocate device memory */
    VkMemoryAllocateInfo alloc_info = {0};
    alloc_info.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    alloc_info.allocationSize = mem_reqs.size;
    alloc_info.memoryTypeIndex = memory_type_index;
    
    VkDeviceMemory memory = VK_NULL_HANDLE;
    result = vkAllocateMemory(device, &alloc_info, NULL, &memory);
    if (result != VK_SUCCESS) {
        vkDestroyBuffer(device, buffer, NULL);
        return result;
    }
    
    /* Bind buffer to memory */
    result = vkBindBufferMemory(device, buffer, memory, 0);
    if (result != VK_SUCCESS) {
        vkFreeMemory(device, memory, NULL);
        vkDestroyBuffer(device, buffer, NULL);
        return result;
    }
    
    *out_buffer = buffer;
    *out_memory = memory;
    return VK_SUCCESS;
}
