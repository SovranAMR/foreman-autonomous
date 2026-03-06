// Insert after existing struct definitions, before TickContext

/* SynapseTable: Open addressing hash map for learned synaptic weights
 * Stores weight overrides for src->dst connections modified by STDP
 * Key packing: 14 bits for src, 14 bits for dst (supports 10K < 16384 neurons)
 */
#define SYNAPSE_BITS_PER_ID 14
#define SYNAPSE_MAX_NEURON_ID ((1U << SYNAPSE_BITS_PER_ID) - 1)

// Pack src and dst neuron IDs into uint32 key
#define SYNAPSE_KEY_PACK(src, dst) \
    (((uint32_t)(src) << SYNAPSE_BITS_PER_ID) | ((uint32_t)(dst) & SYNAPSE_MAX_NEURON_ID))

// Extract src/dst from packed key
#define SYNAPSE_KEY_SRC(key) ((uint32_t)(key) >> SYNAPSE_BITS_PER_ID)
#define SYNAPSE_KEY_DST(key) ((uint32_t)(key) & SYNAPSE_MAX_NEURON_ID)

// Sentinel values for empty and deleted slots in open addressing
#define SYNAPSE_KEY_EMPTY 0xFFFFFFFFU
#define SYNAPSE_KEY_DELETED 0xFFFFFFFEU

typedef struct {
    uint32_t key;      // Packed src<<14 | dst, or SYNAPSE_KEY_EMPTY/DELETED
    float weight;      // Learned weight override (0.0 - 1.0 range typical)
} SynapseEntry;

// Ensure 8-byte alignment for cache line efficiency
_Static_assert(sizeof(SynapseEntry) == 8, "SynapseEntry must be 8 bytes");

typedef struct {
    SynapseEntry* entries;   // Pre-allocated array of size 'capacity'
    uint32_t capacity;       // Power of 2, sized for load factor < 0.67
    uint32_t count;          // Number of occupied slots (excluding DELETED)
    uint32_t deleted_count;  // Number of DELETED slots (for rehash consideration)
} SynapseTable;

// SynapseTable API
// Initialize table with pre-allocated capacity (must be power of 2, >= 1024)
int synapse_table_init(SynapseTable* table, uint32_t initial_capacity);
// Free table memory
void synapse_table_free(SynapseTable* table);
// Get weight for src->dst. Returns 1 if found (weight written to *out_weight), 0 if not found
int synapse_table_get(const SynapseTable* table, uint32_t src, uint32_t dst, float* out_weight);
// Set weight for src->dst. Returns 0 on success, -1 on error (table full)
int synapse_table_set(SynapseTable* table, uint32_t src, uint32_t dst, float weight);
// Clear all entries (reset to empty, keep capacity)
void synapse_table_clear(SynapseTable* table);