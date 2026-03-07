/*
 * Fıtrat — Innate Neural Intelligence
 * Copyright (c) 2026 SovranAMR. All rights reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * Non-commercial personal/educational use only.
 * See LICENSE file for full terms.
 */
#include "vk_init.h"
#include <vulkan/vulkan.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PREFERRED_VENDOR_AMD 0x1002

static int check_validation_layer_support(void) {
    uint32_t layer_count;
    vkEnumerateInstanceLayerProperties(&layer_count, NULL);
    
    VkLayerProperties* layers = malloc(sizeof(VkLayerProperties) * layer_count);
    vkEnumerateInstanceLayerProperties(&layer_count, layers);
    
    const char* validation_layer = "VK_LAYER_KHRONOS_validation";
    int found = 0;
    
    for (uint32_t i = 0; i < layer_count; i++) {
        if (strcmp(layers[i].layerName, validation_layer) == 0) {
            found = 1;
            break;
        }
    }
    
    free(layers);
    return found;
}

int create_vulkan_context(vulkan_context_t* ctx) {
    VkApplicationInfo app_info = {
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "Fıtrat2 Brain Simulation",
        .applicationVersion = VK_MAKE_VERSION(1, 0, 0),
        .pEngineName = "Fitrat2 Compute Engine",
        .engineVersion = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion = VK_API_VERSION_1_2
    };
    
    const char** extensions = NULL;
    uint32_t extension_count = 0;
    
#ifdef DEBUG
    const char* validation_layers[] = {"VK_LAYER_KHRONOS_validation"};
    uint32_t layer_count = 1;
    if (!check_validation_layer_support()) {
        fprintf(stderr, "Validation layers requested but not available
");
        layer_count = 0;
    }
#else
    const char** validation_layers = NULL;
    uint32_t layer_count = 0;
#endif

    VkInstanceCreateInfo create_info = {
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &app_info,
        .enabledExtensionCount = extension_count,
        .ppEnabledExtensionNames = extensions,
        .enabledLayerCount = layer_count,
        .ppEnabledLayerNames = validation_layers
    };
    
    VkResult result = vkCreateInstance(&create_info, NULL, &ctx->instance);
    if (result != VK_SUCCESS) {
        fprintf(stderr, "Failed to create Vulkan instance: %d
", result);
        return -1;
    }
    
    // Enumerate physical devices
    uint32_t device_count = 0;
    vkEnumeratePhysicalDevices(ctx->instance, &device_count, NULL);
    if (device_count == 0) {
        fprintf(stderr, "No Vulkan-capable devices found
");
        vkDestroyInstance(ctx->instance, NULL);
        return -1;
    }
    
    VkPhysicalDevice* devices = malloc(sizeof(VkPhysicalDevice) * device_count);
    vkEnumeratePhysicalDevices(ctx->instance, &device_count, devices);
    
    // Select physical device - prefer AMD
    ctx->physical_device = devices[0];
    VkPhysicalDeviceProperties props;
    vkGetPhysicalDeviceProperties(ctx->physical_device, &props);
    
    for (uint32_t i = 0; i < device_count; i++) {
        VkPhysicalDeviceProperties p;
        vkGetPhysicalDeviceProperties(devices[i], &p);
        
        if (p.vendorID == PREFERRED_VENDOR_AMD) {
            ctx->physical_device = devices[i];
            printf("Selected AMD GPU: %s
", p.deviceName);
            break;
        }
    }
    
    if (ctx->physical_device == devices[0] && props.vendorID != PREFERRED_VENDOR_AMD) {
        printf("No AMD GPU found, using: %s
", props.deviceName);
    }
    
    vkGetPhysicalDeviceProperties(ctx->physical_device, &props);
    ctx->device_limits = props.limits;
    
    free(devices);
    
    // Find compute queue family
    uint32_t queue_family_count = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(ctx->physical_device, &queue_family_count, NULL);
    
    VkQueueFamilyProperties* queue_families = malloc(sizeof(VkQueueFamilyProperties) * queue_family_count);
    vkGetPhysicalDeviceQueueFamilyProperties(ctx->physical_device, &queue_family_count, queue_families);
    
    ctx->compute_family_index = -1;
    for (uint32_t i = 0; i < queue_family_count; i++) {
        if (queue_families[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
            ctx->compute_family_index = i;
            break;
        }
    }
    
    free(queue_families);
    
    if (ctx->compute_family_index == -1) {
        fprintf(stderr, "No compute queue family found
");
        vkDestroyInstance(ctx->instance, NULL);
        return -1;
    }
    
    // Create logical device
    float queue_priority = 1.0f;
    VkDeviceQueueCreateInfo queue_create_info = {
        .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
        .queueFamilyIndex = ctx->compute_family_index,
        .queueCount = 1,
        .pQueuePriorities = &queue_priority
    };
    
    VkPhysicalDeviceFeatures device_features = {0};
    
    VkDeviceCreateInfo device_create_info = {
        .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
        .queueCreateInfoCount = 1,
        .pQueueCreateInfos = &queue_create_info,
        .pEnabledFeatures = &device_features,
        .enabledLayerCount = layer_count,
        .ppEnabledLayerNames = validation_layers
    };
    
    result = vkCreateDevice(ctx->physical_device, &device_create_info, NULL, &ctx->device);
    if (result != VK_SUCCESS) {
        fprintf(stderr, "Failed to create logical device: %d
", result);
        vkDestroyInstance(ctx->instance, NULL);
        return -1;
    }
    
    vkGetDeviceQueue(ctx->device, ctx->compute_family_index, 0, &ctx->compute_queue);
    
    printf("Vulkan 1.2 context created successfully
");
    printf("Max compute work group size: %u
", ctx->device_limits.maxComputeWorkGroupSize[0]);
    printf("Max compute work group count: %u
", ctx->device_limits.maxComputeWorkGroupCount[0]);
    
    return 0;
}

void destroy_vulkan_context(vulkan_context_t* ctx) {
    if (ctx->device != VK_NULL_HANDLE) {
        vkDestroyDevice(ctx->device, NULL);
        ctx->device = VK_NULL_HANDLE;
    }
    if (ctx->instance != VK_NULL_HANDLE) {
        vkDestroyInstance(ctx->instance, NULL);
        ctx->instance = VK_NULL_HANDLE;
    }
    printf("Vulkan context destroyed
");
}
