<p align="center">
  <img src="https://img.shields.io/badge/Language-C99-blue?style=for-the-badge&logo=c&logoColor=white" />
  <img src="https://img.shields.io/badge/Dependencies-ZERO-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Neuron_Size-8_bytes-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Frameworks-NONE-red?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-Proprietary-critical?style=for-the-badge" />
</p>

<br/>

<h1 align="center">
  
```
  ███████╗██╗████████╗██████╗  █████╗ ████████╗
  ██╔════╝██║╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝
  █████╗  ██║   ██║   ██████╔╝███████║   ██║   
  ██╔══╝  ██║   ██║   ██╔══██╗██╔══██║   ██║   
  ██║     ██║   ██║   ██║  ██║██║  ██║   ██║   
  ╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
```

<br/>

**A brain that fires, learns, dreams, and evolves.**

*Pure C99. No frameworks. No matrices. No GPU required.*
*Just biology, distilled into 3,500 lines of code.*

</h1>

<br/>

<p align="center">
  <strong>Fıtrat</strong> (Turkish: <em>innate nature</em>) is a biologically-accurate spiking neural network that models the brain at the individual neuron level. Every neuron has DNA. Every synapse has a weight learned through spike-timing. The network sleeps, dreams, and evolves through natural selection. It learns language through pure neural dynamics — no backpropagation, no loss functions, no gradient descent.
</p>

<br/>

---

<br/>

## ⚡ What Makes This Different

Most "neural networks" are matrix multipliers wearing a neuroscience costume. Fıtrat is not.

| Feature | Traditional NN | Fıtrat |
|---------|:---:|:---:|
| **Processing unit** | Float vector | Individual spiking neuron (8 bytes) |
| **Learning rule** | Backpropagation | Spike-Timing Dependent Plasticity (STDP) |
| **Connectivity** | Dense layers | 3D spatial hash — neurons connect to neighbors |
| **Position encoding** | Positional embeddings | Morton Z-order curves — position IS the ID |
| **Memory** | Weight matrices | Bloom-filtered synapse table (1GB filter → 99% I/O reduction) |
| **Sleep** | ❌ | ✅ REM replay + Tafakkur (contemplation) phases |
| **Evolution** | ❌ | ✅ Neurons reproduce, mutate, and die |
| **Neuromodulation** | ❌ | ✅ Valence · Arousal · Curiosity signals |
| **Dependencies** | PyTorch, CUDA, 50GB+ | `gcc` and `libc`. That's it. |

<br/>

---

<br/>

## 🧬 Architecture

<br/>

```
                    ┌─────────────────────────────────────────────┐
                    │              F I T R A T   B R A I N        │
                    │                                             │
    STIMULUS ──────►│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │──────► RESPONSE
    "selam"         │  │  INPUT   │  │  HIDDEN   │  │  OUTPUT    │  │  "aleykum selam"
                    │  │  Z=0     │──│  Z=1-254  │──│  Z=255     │  │
                    │  │  Layer   │  │  Layers   │  │  Layer     │  │
                    │  └─────────┘  └──────────┘  └───────────┘  │
                    │       │            │              │         │
                    │       ▼            ▼              ▼         │
                    │  ┌─────────────────────────────────────┐    │
                    │  │         SPATIAL HASH GRID            │    │
                    │  │    O(1) neighbor lookup via          │    │
                    │  │    Morton Z-order coordinates        │    │
                    │  └─────────────────────────────────────┘    │
                    │       │            │              │         │
                    │       ▼            ▼              ▼         │
                    │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
                    │  │  STDP    │ │  BLOOM   │ │  SYNAPSE   │  │
                    │  │ Learning │ │  FILTER  │ │  TABLE     │  │
                    │  │          │ │  (1 GB)  │ │  (hashmap) │  │
                    │  └──────────┘ └──────────┘ └────────────┘  │
                    │                                             │
                    │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
                    │  │  SLEEP   │ │ NEURO-   │ │ EVOLUTION  │  │
                    │  │  CYCLE   │ │ MODULAT. │ │ birth/die  │  │
                    │  │ REM+CONT │ │ V·A·C    │ │ reproduce  │  │
                    │  └──────────┘ └──────────┘ └────────────┘  │
                    └─────────────────────────────────────────────┘
```

<br/>

### The Tick Pipeline

Every simulation tick executes **9 stages** in strict order:

```
 ┌──────┐    ┌───────────┐    ┌──────┐    ┌───────┐    ┌──────────┐
 │ FIRE │───►│ PROPAGATE │───►│ STDP │───►│ DECAY │───►│ NEUROMOD │
 └──────┘    └───────────┘    └──────┘    └───────┘    └──────────┘
                                                             │
 ┌────────────┐    ┌──────────┐    ┌──────────┐    ┌─────────▼──┐
 │ CHECKPOINT │◄───│  OUTPUT  │◄───│ EVOLUTION│◄───│   SLEEP    │
 └────────────┘    └──────────┘    └──────────┘    └────────────┘
```

Each stage is a pure function over the neuron array. No hidden state. No magic.

<br/>

---

<br/>

## 🔬 The Neuron

Every neuron is a **packed 8-byte struct** — smaller than a pointer on most systems:

```c
typedef struct {
    uint8_t  flags;        // type (excitatory/inhibitory) + alive + fired + plasticity + layer
    uint8_t  activation;   // current membrane potential [0-255] → [0.0-1.0]
    uint8_t  threshold;    // firing threshold [0-255] → [0.0-2.0]
    uint8_t  ema;          // exponential moving average (homeostasis)
    uint8_t  modulator;    // per-neuron plasticity multiplier
    uint8_t  dna_extra;    // mutation_rate(4) + max_inactivity_class(2) + reserved(2)
    uint16_t last_fire_dt; // ticks since last fire (STDP timing window)
} __attribute__((packed)) Neuron;

_Static_assert(sizeof(Neuron) == 8, "Neuron struct must be exactly 8 bytes");
```

**Every neuron has DNA.** The `dna_extra` field encodes mutation rate and survival traits. When neurons reproduce, offspring inherit traits with mutations. Natural selection operates on the network itself.

<br/>

---

<br/>

## 🧠 Key Subsystems

<br/>

### 🌀 Morton Code Spatial Encoding
Neuron positions aren't stored — they're **computed from the ID** using Z-order curve encoding. A neuron's ID *is* its 3D coordinate: `X[12 bits] | Y[12 bits] | Z[8 bits]`. Decoding costs 3 shifts + 3 masks (~5 ALU cycles). Zero memory overhead.

### ⚡ Spike-Timing Dependent Plasticity (STDP)
Real Hebbian learning: if neuron A fires *before* neuron B, strengthen A→B. If A fires *after* B, weaken it. The timing window is ±40 ticks with exponential decay. Learned weights persist in a hash-map synapse table.

### 🌸 Bloom-Filtered Synapse Lookup
99% of synapses never change. A **1GB Bloom filter** with 4 hash functions screens lookups before hitting the synapse table. False positive rate: ~0.05%. Result: 99% of propagation uses the default weight with zero table I/O.

### 😴 Sleep & Dreams
The network has a **circadian rhythm**:
- **REM Phase** — Random replay of stored spike patterns. Memory consolidation through re-activation.
- **Tafakkur Phase** — Contemplation. Low-noise introspective processing. The network "thinks" without external input.

### 🧬 Neuronal Evolution
Every 10,000 ticks, the grim reaper visits:
- Inactive neurons **die** (their slot is freed).
- Active neurons with `can_reproduce` flag **spawn offspring** with mutated DNA.
- The network literally evolves its own topology.

### 🎛️ Neuromodulation
Global brain-state signals modulate all processing:
- **Valence** — Positive/negative emotional charge
- **Arousal** — Alertness level (affects firing thresholds)
- **Curiosity** — Exploration drive (affects plasticity)

### 🌉 Poisson Bridge
Bidirectional protocol between macrocolumn (float) and spiking (binary) representations. Follows Human Brain Project standards. Enables future multi-scale simulation.

### 💾 Checkpoint System
Full brain state serialization. Save 50K+ neurons to disk and restore exactly. Training can be interrupted and resumed without loss.

<br/>

---

<br/>

## 🚀 Getting Started

### Build

```bash
git clone https://github.com/SovranAMR/fitrat.git
cd fitrat
make
```

Requirements: `gcc` with C99 support and a POSIX system. **No other dependencies.**

### Train

```bash
./fitrat2
```

Trains through a progressive curriculum — from 2-letter echoes to full Turkish conversations. Watch the neural network learn in real-time:

```
[EPOCH 1] selam → selam  ✓  (dist=0)
[EPOCH 3] nasilsin → iyiyim  ✓  (dist=0)
[EPOCH 5] allah var mi → evet  ✓  (dist=0)
```

### Chat

```bash
./fitrat2 --chat
```

Interactive mode. Type a message, get a neural response. No lookup tables, no pattern matching — pure spike dynamics:

```
YOU: selam
REPLY: aleykum selam

YOU: nasilsin
REPLY: iyiyim

YOU: kimsin
REPLY: ben ali
```

<br/>

---

<br/>

## 📊 By The Numbers

| Metric | Value |
|--------|-------|
| **Total source** | ~3,500 lines of C99 |
| **Source files** | 35 (.c + .h) |
| **Neuron memory** | 8 bytes each |
| **External dependencies** | 0 |
| **Frameworks used** | 0 |
| **GPU required** | No |
| **Matrices multiplied** | 0 |
| **Backpropagation passes** | 0 |
| **Build time** | < 2 seconds |
| **Binary size** | ~100 KB |

<br/>

---

<br/>

## 🗺️ Project Structure

```
src/
├── main.c             # Training loop + interactive chat mode
├── neuron.h           # 8-byte packed neuron struct + DNA flags
├── tick.c / tick.h     # 9-stage tick pipeline orchestrator
├── learning.c / .h    # STDP + spike recording + competitive learning
├── synapse_table.c/.h # Hash-map persistent synapse weights
├── io.c / io.h        # Text ↔ spike encoding/decoding + populations
├── grid.c / grid.h    # Spatial hash grid for O(1) neighbor lookup
├── morton.c / .h      # Z-order curve position encoding
├── bloom.h            # 1GB Bloom filter for synapse screening
├── evolution.c / .h   # Neuronal birth, death, and reproduction
├── sleep.c / .h       # REM replay + tafakkur (contemplation)
├── neuromod.c / .h    # Valence · Arousal · Curiosity modulation
├── poisson.c / .h     # Macrocolumn ↔ spike bridge (HBP standard)
├── homeostasis.c / .h # Activity-dependent threshold regulation
├── checkpoint.c / .h  # Full brain state serialization
├── hash.c / .h        # FNV-1a + Murmur3 hash functions
└── Makefile           # Single `make` builds everything
```

<br/>

---

<br/>

## 💡 Philosophy

> **"Fıtrat"** means *innate nature* in Turkish — the original disposition that every being is born with.

This project rejects the dominant paradigm of artificial neural networks. Instead of simulating *the math that describes intelligence*, it simulates *the biology that produces it*.

There is no loss function to minimize. There is no gradient to descend. There are only neurons — each one unique, each one alive, each one following the same simple rules that real neurons follow:

1. **If your input exceeds your threshold, fire.**
2. **If you fire together, wire together.**
3. **If you're inactive too long, die.**
4. **If you're active enough, reproduce.**

From these four rules, intelligence is not programmed — it **emerges**.

<br/>

---

<br/>

## 🏗️ Roadmap

- [ ] Vulkan GPU compute for parallel propagation
- [ ] Multi-language curriculum (Turkish → English → Arabic)
- [ ] Persistent long-term memory across sessions
- [ ] Emotional response modulation
- [ ] Telegram bot interface
- [ ] Visual cortex — image spike encoding
- [ ] Multi-brain communication protocol

<br/>

---

<br/>

<p align="center">
  <strong>Built with bare metal and biological truth.</strong><br/>
  <em>No frameworks were harmed in the making of this brain.</em>
</p>

<p align="center">
  <sub>Created by <a href="https://github.com/SovranAMR">SovranAMR</a></sub>
</p>
