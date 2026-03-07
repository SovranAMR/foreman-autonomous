# Project Memory

_Last synced: 2026-03-07_

## Decisions

📌 [visioner] associations rather than static echoes.

OUTPUT:
**GOAL**: Enable organic learning by replacing static hash-based synapses with mutable, persistent synaptic weights that evolve through STDP, allowing ... <!-- mem_001 -->
📌 [visioner] associations rather than static echoes. <!-- mem_037 -->
📌 Block 1/8: Implement SynapseTable data structure and lifecycle in tick. — 2 atoms completed `foreman` `pipeline` `block_1` <!-- mem_012 -->
📌 Block 5/8: Integrate synapse_table_init() into tick_create() and synaps — 1 atoms completed `foreman` `pipeline` `block_5` <!-- mem_016 -->
📌 Block 6/8: Acceptance: make cpu_only compiles without warnings; table s — 1 atoms completed `foreman` `pipeline` `block_6` <!-- mem_018 -->
📌 Block 7/8: Integrate mutable weights into propagation and STDP in tick_ — 1 atoms completed `foreman` `pipeline` `block_7` <!-- mem_022 -->
📌 Block 8/8: Modify tick_propagate() to query synapse_table_get(src,dst)  — 1 atoms completed `foreman` `pipeline` `block_8` <!-- mem_025 -->
📌 Block 2/8: Add SynapseEntry struct (uint32 key packing src/dst neuron I — 1 atoms completed `foreman` `pipeline` `block_2` <!-- mem_029 -->
📌 Block 3/8: Add function declarations to tick.h: synapse_table_init(), s — 1 atoms completed `foreman` `pipeline` `block_3` <!-- mem_032 -->
📌 Block 4/8: Implement table operations in tick.c using pre-allocated arr — 1 atoms completed `foreman` `pipeline` `block_4` <!-- mem_036 -->

## Patterns

📌 [strategist] 1. Implement SynapseTable data structure and lifecycle in tick.h and tick.c
2. Add SynapseEntry struct (uint32 key packing src/dst neuron IDs via bitwise operations, float weight) and SynapseTable str... <!-- mem_002 -->
📌 [strategist] 1. Modify to add SynapseTable data structures and API declarations. Add struct (uint32 packed key + float weight, 8-byte align... <!-- mem_004 -->
📌 [strategist] 1. Read and quote the existing struct definitions section (Neuron, Synapse, etc.) to identify the insertion point. Insert stru... <!-- mem_006 -->
📌 [strategist] 1. Read to locate and functions. Implement the five synapse table operations: `synapse_table_init(SynapseTab... <!-- mem_014 -->
📌 [strategist] 1. Read to locate and the STDP update function (typically,, or similar). Modify `tick_... <!-- mem_020 -->
📌 [strategist] 1. Read to locate the function and identify where is currently called to retrieve syna... <!-- mem_023 -->
📌 [strategist] 1. Read to locate the existing struct definition. Immediately after the struct's closing brace, insert the following... <!-- mem_027 -->
📌 [strategist] 1. Read to identify the file structure and locate the insertion point for new functions (typically after existing static utility functions or... <!-- mem_034 -->
📌 [strategist] 1. Implement SynapseTable data structure and lifecycle in tick.h and tick.c <!-- mem_038 -->

## Lessons Learned

⚠️ [worker] No previous response exists to reformat. The pipeline appears to have no content from a prior turn. I am ready to receive the atomic task specification including: target file path, specific change req... <!-- mem_024 -->
📌 [worker] Successfully added SynapseTable data structures to tick.h:
1. `SynapseEntry` struct (8-byte aligned: uint32_t key + float weight) inserted after Synapse struct
2. `SYNAPSE_KEY_PACK(src, dst)` macro de... <!-- mem_028 -->
📌 [worker] Added SynapseTable data structures to tick.h with 14-bit packing for neuron IDs (supporting 10K neurons), open addressing hash map design with EMPTY/DELETED sentinels, and 8-byte aligned entries. Adde... <!-- mem_005 -->
📌 [worker] Successfully added SynapseTable struct to tick.h with all four required fields: capacity (power-of-2 size), count (active entries), mask (capacity-1 for fast modulo), and entries (pre-allocated array ... <!-- mem_008 -->
📌 [worker] - Added `SynapseTable` struct definition with entries pointer, capacity, count, and mask fields.
- Added 5 function declarations for synapse table operations (init, free, get, set, clear).
- Added `Sy... <!-- mem_010 -->
📌 [worker] Completed implementation of `tick_create()` and `tick_destroy()` in tick.c. 
- `tick_create()` now properly initializes a TickContext with default values (256 neurons, threshold 0.5, history size 100)... <!-- mem_015 -->
📌 [worker] Successfully implemented all 5 SynapseTable operations (init, free, get, set, clear) in tick.c with open addressing hash map using linear probing. Integrated lifecycle management into tick_create() (i... <!-- mem_017 -->
📌 [worker] Successfully added five function declarations for the SynapseTable API immediately after the SynapseTable struct definition in tick.h. All declarations have correct signatures matching the existing im... <!-- mem_031 -->
📌 [worker] Successfully implemented all five SynapseTable operations in tick.c:
1. `synapse_table_init` - Initializes table with power-of-2 capacity, allocates entries, initializes to EMPTY sentinel
2. `synapse_... <!-- mem_035 -->
📌 [worker] Successfully added struct and key packing macros to. The struct is placed immediately after the existing struct (line 26) and before. Key macros are def... <!-- mem_007 -->
📌 [worker] Successfully added struct to with the named struct tag (not anonymous), ensuring the acceptance criteria grep command works. The struct contains a... <!-- mem_009 -->
📌 [worker] Successfully integrated mutable synaptic weights into. Modified to check before performing table lookups, falling back to `synapse_... <!-- mem_021 -->
📌 [worker] Successfully added SynapseTable data structures to tick.h: <!-- mem_039 -->
📌 [worker] - Added struct definition with entries pointer, capacity, count, and mask fields. <!-- mem_040 -->
📌 [worker] Completed implementation of and in tick.c. <!-- mem_041 -->
📌 [worker] Successfully implemented all five SynapseTable operations in tick.c: <!-- mem_042 -->
📌 BLOCK RE-DECOMPOSED (Block 1): "Implement SynapseTable data structure and lifecycle in tick." — 1/2 failures. Re-atomized and re-executed. `foreman` `pipeline` `re_decompose` `block_1` <!-- mem_011 -->

## References

📌 [researcher] Open addressing hash maps are the optimal choice for this embedded C neural network context due to zero per-entry pointer overhead (unlike chaining) and cache-friendly linear probing. For 10K neurons,... <!-- mem_003 -->
📌 [researcher] Integration of hash table lifecycle into existing C neural network architectures requires careful attention to failure atomicity and memory layout. For the Fıtrat 10K-neuron network with sparse learne... <!-- mem_013 -->
📌 [researcher] For the Fıtrat 10K-neuron SNN, bit-packing neuron IDs into a 32-bit key using 14 bits per ID (src << 14 | dst) supports up to 16,384 neurons, exceeding the 10K requirement while leaving 4 bits availab... <!-- mem_026 -->
📌 [researcher] Function declarations for the SynapseTable API must serve as a strict contract between the hash table implementation (tick.c) and its consumers in the hot path (tick_step_cpu.c propagation/STDP). Key ... <!-- mem_030 -->
📌 [researcher] Open addressing with linear probing is optimal for this embedded neural network context, but requires careful tuning for the 1.28M lookups/tick hot path. For 10K neurons with 128 synapses each (1.28M ... <!-- mem_033 -->
📌 [researcher] Integration of mutable synaptic weights into and STDP requires optimizing the 1.28M lookups/tick hot path (10K neurons × 128 synapses) while ensuring biological plausibility and stabi... <!-- mem_019 -->
