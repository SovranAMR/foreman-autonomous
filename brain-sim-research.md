# 🧠 Brain Simulation on Consumer Hardware — Feasibility Research

**Hardware**: i5-13400F | 32 GB DDR4 | RX 6700 XT (12 GB) | 465 GB NVMe + 931 GB HDD  
**Target**: 86 billion neurons, 600 trillion synapses  
**Date**: 2026-03-03

---

## Executive Summary

Full neuron-level brain simulation is **physically impossible** on this hardware — not because of compute, but because of the **memory wall**. No compression, hashing, or algorithmic trick can bridge a 20,000x memory gap while preserving per-synapse computation. However, **multi-scale hybrid simulation** can produce brain-like computation at reduced temporal resolution. The sweet spot is **column-level background + neuron-level spotlight**, achieving ~1-10 ticks/second for a meaningful subset of brain dynamics.

---

## 1. PROCEDURAL CONNECTIVITY — Deep Dive

### Is It a Known Technique?

**YES.** This is a well-established technique called **"procedural connectivity"** in computational neuroscience.

**Primary Reference:** Knight & Nowotny (2021). "Larger GPU-accelerated brain simulations with procedural connectivity." *Nature Computational Science*, 1, 136–142. DOI: `10.1038/s43588-020-00022-7`

GeNN (GPU-Enhanced Neuronal Networks) implements this as `SynapseMatrixType.PROCEDURAL`:

> *"Sparse synaptic connectivity is generated on the fly using a sparse connectivity initialisation snippet and all state variables must be either constant or generated on the fly using variable initialisation snippets. Synaptic connectivity of this sort requires very little memory allowing extremely large models to be simulated on a single GPU."*
> — GeNN v5 Documentation

### How GeNN Does It

GeNN offers multiple connectivity modes:
- `DENSE` — full N×M matrix stored in memory
- `SPARSE` — compressed sparse row (CSR) format
- `BITMASK` — 1-bit per potential synapse (good for >3% density)
- **`PROCEDURAL`** — **zero storage**, connectivity generated per-spike via code snippets
- `PROCEDURAL_KERNELG` — procedural connectivity + shared kernel weights
- `TOEPLITZ` — procedural convolution-like connectivity

The `PROCEDURAL` mode uses a user-defined `row_build_code` snippet that runs on the GPU for each presynaptic spike, generating postsynaptic targets on-the-fly. This is functionally equivalent to your hash-based approach.

### Your Hash vs. GeNN's Approach

| Aspect | Your Proposal | GeNN's Implementation |
|--------|--------------|----------------------|
| Connectivity function | `hash(a, b, seed) < threshold` | Distance-dependent probability functions |
| Weight generation | `hash(a, b, weight_seed) % 26` | Variable init snippets (can be procedural) |
| Distance dependency | Missing (critical flaw) | Built-in via spatial models |
| Implementation | Custom | Battle-tested, published |
| Backend | Custom HIP/OpenCL | CUDA + **HIP** (official) |

**Critical insight**: Your pure hash approach loses **distance-dependent connectivity** — the #1 structural principle of cortical wiring. Brain connectivity probability decays exponentially with distance (P ∝ e^(-d/λ), λ ≈ 300μm in cortex). A spatially-blind hash generates biologically meaningless topology.

**Fix**: `synapse_exists(a, b) = hash(a, b, seed) < threshold(distance(pos[a], pos[b]))` — but now you need a position array (86B × 12 bytes = 1 TB for 3D coords), defeating the purpose.

### Throughput Calculation on RX 6700 XT

```
RX 6700 XT: 13.2 TFLOPS FP32, 2560 shaders, 384 GB/s bandwidth
Hash function (xxHash32): ~4 INT ops per hash ≈ 2 FLOP equivalent
Theoretical: 13.2T / 2 = 6.6 trillion hashes/second

BUT: Memory-bound, not compute-bound.
Each hash needs neuron positions → random memory access
VRAM bandwidth: 384 GB/s
Per hash: read 2 × 12 bytes (positions) = 24 bytes (cache miss case)
Bandwidth-limited: 384 GB/s / 24 bytes = 16 billion hashes/second

With 1% fire rate (860M neurons fire per tick):
Synapses to evaluate: 860M × 7000 avg connections = 6.02 trillion
Time per tick: 6.02T / 16B = 376 seconds

Even with 100% cache hit rate (impossible):
6.02T / 6.6T = 0.91 seconds per tick
```

**Verdict**: Procedural connectivity is real and powerful, but at brain scale (86B neurons) it's **376 seconds/tick** on your GPU. Useful for sub-networks of up to ~100M neurons.

---

## 2. CORTICAL MINICOLUMN — Corrected Math

### Your Error

You stated "2 million cortical minicolumns of ~80 neurons each." This is wrong by 100x.

**Correct numbers (Mountcastle 1997, Rakic 2008):**
- Neocortex: ~16 billion neurons
- Minicolumn: ~80-120 neurons (varies by region)
- **Minicolumn count: 16B / 100 ≈ 160-200 million**
- Macrocolumns (~80 minicolumns each): ~2 million ← this is where your "2M" came from

### Corrected Memory Budget

```
Minicolumns: 200M (200 million, not 2 million)

Option A: Full 80×80 intra-column weight matrix
  200M × 80 × 80 × 1 byte = 1.28 TB ← DOES NOT FIT

Option B: PCA-reduced column state (k=4 principal components)
  State: 200M × 4 × 4 bytes = 3.2 GB
  Intra-column dynamics: 200M × (4×4 matrix) × 4 bytes = 12.8 GB
  Inter-column connectivity: ~0.1% density = 40B connections
    40B × 5 bytes (target + weight) = 200 GB ← NVMe territory
  Total: ~216 GB

Option C: PCA-reduced (k=8)
  State: 200M × 8 × 4 = 6.4 GB
  Intra-column: 200M × 64 × 4 = 51.2 GB
  Inter-column: 200 GB
  Total: ~258 GB

Option D: Macrocolumn level (2M units)
  State: 2M × 80 × 4 bytes = 640 MB
  Intra-macro weights: 2M × 80 × 80 × 1 byte = 12.8 GB
  Inter-macro connectivity: 2M × 0.1% × 2M = 4B connections
    4B × 5 bytes = 20 GB
  Total: ~33 GB ← FITS IN RAM!
```

### Computational Properties Lost at Each Level

| Level | What Survives | What's Lost |
|-------|--------------|-------------|
| Neuron (86B) | Everything | Nothing |
| Minicolumn (200M, PCA-4) | Oscillations, inter-region communication, macro plasticity | Dendritic computation, STDP, sparse coding, individual spike timing |
| Macrocolumn (2M) | Regional activation patterns, global workspace dynamics | All of the above + intra-column competition, local inhibitory circuits |
| Neural mass (400 regions) | Mean-field oscillations, bifurcation dynamics | Everything except population-level firing rates |

---

## 3. SPARSE DISTRIBUTED MEMORY (SDM)

### What It Is

Kanerva's SDM (1988) is a **content-addressable memory** operating in high-dimensional binary space. It's not a brain simulator — it's a model of one specific brain function: **associative recall**.

### Where It Works
- Pattern completion (partial cue → full memory)
- Auto-associative memory (hippocampal function)
- Prototype extraction from noisy examples
- Extremely memory efficient: ~125 MB for 1M hard locations × 1000 bits

### Where It Breaks Down
- **No temporal dynamics**: SDM is a static lookup, not a dynamical system
- **No sequences**: Can't do serial recall, motor planning, language generation
- **No attention**: No mechanism for selective processing
- **No learning rule**: No STDP, no backprop, no Hebbian learning during operation
- **No oscillations**: No theta, gamma, alpha rhythms — which are computationally significant

### Best Use

SDM is a **component**, not a replacement. Use it as the **memory subsystem** within a larger hybrid architecture — specifically modeling hippocampal pattern completion.

---

## 4. NEURAL MASS MODELS

### Wilson-Cowan Over 400 Regions

```
Variables: 2 ODEs (excitatory + inhibitory rate) × 400 regions = 800 ODEs
Memory: 800 × 8 bytes = 6.4 KB
Compute: Euler step = ~5 FLOPs/ODE × 800 = 4000 FLOPs/tick
At 1 GFLOP (single core): 250,000 ticks/second
At 13.2 TFLOPS (GPU): ~3.3 billion ticks/second
```

### What Survives
- ✅ Inter-region connectivity dynamics
- ✅ Oscillatory rhythms (alpha, beta, gamma — as population phenomena)
- ✅ Bifurcation analysis (epileptic transitions, sleep stages)
- ✅ Resting-state functional connectivity patterns
- ✅ The Virtual Brain (TVB) project runs exactly this → clinical-grade predictions

### What's Lost
- ❌ Learning and memory (no synaptic plasticity)
- ❌ Perception (no feature extraction)
- ❌ Decision making (no attractor dynamics at neuron level)
- ❌ Language, motor control, reasoning
- ❌ Everything that makes a brain a "mind"

### TVB (The Virtual Brain) — What It Actually Does

TVB is a **clinical neuroscience platform** (74,650+ downloads) that simulates brain dynamics using neural mass models on subject-specific connectomes derived from MRI/DTI data. It runs on a **standard laptop**.

TVB's use cases:
- Epilepsy surgery planning (predicting seizure propagation)
- Modeling effects of lesions/strokes
- Personalized brain stimulation targeting
- **NOT** cognition, consciousness, or thought simulation

---

## 5. INFORMATION THEORY — The Hard Limits

### Salk Institute Finding (Bartol et al., 2015, eLife)

The Salk team discovered that synapses come in **26 distinguishable sizes** (not the previously assumed 2-3), corresponding to **4.7 bits per synapse**.

Key findings:
- Pairs of synapses from the same axon onto the same dendrite differ by only **~8%** in size
- This 8% precision within a factor-of-60 size range yields ~26 discrete levels
- `log₂(26) = 4.7 bits`

### Total Information Content

```
600 trillion synapses × 4.7 bits = 2.82 petabits = 352.5 terabytes

This is the RAW information content.
```

### Kolmogorov Complexity — Can We Compress It?

The brain's synaptic configuration is NOT random — it has massive structure:

**Sources of redundancy:**
1. **Cell-type stereotypy**: ~100 neuron types with stereotypic connectivity rules. A pyramidal cell in layer 2/3 connects similarly everywhere in cortex. This compresses the "connectivity grammar" to ~100 type-pair rules.

2. **Distance-dependent decay**: Connection probability = f(distance). Exponential decay with 2-3 parameters per region pair. ~400² × 3 = 480K parameters for the connectivity skeleton.

3. **Developmental programs**: Connectivity emerges from ~20,000 genes × positional gradients. The genetic "program" for wiring is ~100 MB (the genome itself).

4. **Bilateral symmetry**: Left and right hemispheres are ~95% structurally identical. 2x compression.

5. **Repetitive cortical architecture**: The "canonical microcircuit" (Douglas & Martin, 2004) repeats across cortex with regional variations. ~1000 regional variants × ~10 MB each = ~10 GB for the template.

**Lower bound estimate:**
```
Genetic program for wiring:    ~100 MB
Regional connectivity rules:   ~500 MB  
Experience-dependent deltas:    ~10-50 TB (the unique part)
─────────────────────────────────────────
Estimated Kolmogorov complexity: 10-50 TB

Compression ratio: 352 TB → 10-50 TB ≈ 7-35x
```

**But here's the catch**: Even at 10 TB compressed, your hardware has 1.4 TB total storage. The gap shrinks from 250x to 7x but **doesn't close**.

### Compression Techniques From Neuroscience

| Technique | Compression | Source |
|-----------|------------|--------|
| Weight quantization (4.7 bits → 3 bits) | 1.6x | Salk constraints |
| Cell-type weight sharing (~100 types) | 10-100x for connectivity rules | Allen Brain Atlas |
| Population coding / random projections | 10-100x for activity patterns | Ganguli & Sompolinsky, 2012 |
| Structured sparsity (block-sparse by region) | 3-5x | Markov et al., 2014 |
| Compressed sensing | ~5x for sparse signals | Ganguli lab, Stanford |
| Low-rank weight matrices | ~10x per region | Recent ML/neuro crossover |

---

## 6. AMD GPU COMPUTE STACK — Honest Assessment

### ROCm Support for RX 6700 XT (gfx1031)

**Official status: ❌ NOT SUPPORTED**

ROCm's supported GPU list for RDNA2:
- ✅ Radeon PRO W6800 (gfx1030)
- ✅ Radeon PRO V620 (gfx1030)
- ❌ RX 6700 XT (gfx1031) — **not listed**

The RX 6700 XT is `gfx1031`, while ROCm only officially supports `gfx1030` in the RDNA2 family. In practice:
- HIP **may compile** with `HSA_OVERRIDE_GFX_VERSION=10.3.0` environment variable
- **No guarantees** — some instructions differ between gfx1030 and gfx1031
- Community reports: mixed results, some workloads crash

### GeNN + HIP on RX 6700 XT

GeNN officially supports HIP backend. The README states:
> *"GeNN is a GPU-enhanced Neuronal Network simulation environment based on code generation for NVIDIA CUDA and AMD HIP."*

Setup:
```bash
export HIP_PATH=/opt/rocm/hip
export HIP_PLATFORM=amd
pip install https://github.com/genn-team/genn/archive/refs/tags/5.3.0.zip
```

**Risk**: gfx1031 may produce incorrect results silently due to instruction differences.

### Recommended Stack Ranking

| Stack | Stability | Performance | Brain Sim Suitability |
|-------|-----------|-------------|----------------------|
| **Vulkan Compute** | ✅ Excellent (Mesa RADV) | ~80% of native | Best for custom kernels |
| **OpenCL** (rusticl/clover) | ⚠️ Improving | ~60-70% of native | Brian2/NEST support |
| **ROCm/HIP** | ❌ Unofficial for gfx1031 | 100% when it works | GeNN, but risky |

**Recommendation**: Use **Vulkan Compute** via `vkFFT` and custom compute shaders. Mesa's RADV driver has first-class gfx1031 support. Write simulation kernels in GLSL compute or use `gpu.cpp` / `wgpu` abstractions.

### Alternative Frameworks — AMD Support

| Framework | AMD Support | Language | Scale |
|-----------|------------|----------|-------|
| **GeNN** | HIP (official, but gfx1031 risky) | Python + C++ | Millions of neurons |
| **Brian2** | CPU only (no GPU) | Python | ~100K neurons |
| **NEST** | CPU only (MPI parallel) | Python/C++ | Billions (on clusters) |
| **ANNarchy** | CUDA only | Python/C++ | Millions |
| **Brian2CUDA** | CUDA only | Python | Millions |
| **CARLsim** | CUDA only | C++ | Millions |

**Verdict**: For AMD consumer GPUs, custom Vulkan compute is the most reliable path.

---

## 7. WHAT'S ACTUALLY BEEN ACHIEVED

### Largest Brain Simulations

| Project | Scale | Hardware | Speed | Year |
|---------|-------|----------|-------|------|
| Riken K Computer (Markram) | 1.73B neurons, 10.4T synapses | 82,944 processors, 1 PB RAM | 2400x slower than real-time | 2013 |
| Human Brain Project (NEST) | Full cortex model | Jülich supercomputer | Research-only | 2020+ |
| SpiNNaker 1M | 1M neurons | 1 million ARM cores | Real-time | 2018 |
| BrainScaleS | ~500K neurons | Custom analog ASIC wafers | 10,000x faster than real-time | 2022 |
| GeNN (consumer GPU) | ~1M spiking neurons | Single NVIDIA GPU | Near real-time | 2021 |

### Key Tricks from Neuromorphic Hardware

**SpiNNaker:**
- 1 million ARM968 cores, each simulating ~1000 neurons
- Key trick: **event-driven** — only compute when a spike occurs
- Multicast routing for spike delivery (hardware level)
- No synaptic matrix stored — connectivity programmed into routers

**BrainScaleS:**
- Analog circuits physically implement neuron differential equations
- **10,000x acceleration** — circuits run at analog speed, not digital clock
- Key trick: **physics does the computation** — no multiply-accumulate needed

**Numenta HTM (column-level):**
- Simulates cortical columns as computational units
- Demonstrated temporal memory, anomaly detection, sensorimotor inference
- Key result: **column-level IS sufficient** for certain cognitive tasks (sequence learning, prediction)
- But: no perceptual grounding, no cross-modal integration, no language

---

## 8. THE FINAL ARCHITECTURE — Hybrid Multi-Scale

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY HIERARCHY                          │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌──────────┐ │
│  │ GPU VRAM │  │   SYSTEM RAM  │  │  NVMe   │  │   HDD    │ │
│  │  12 GB   │  │    32 GB      │  │ 465 GB  │  │  931 GB  │ │
│  │          │  │               │  │         │  │          │ │
│  │ Active   │  │ All macro-    │  │ Full    │  │ Snapshot │ │
│  │ spotlight│  │ columns +     │  │ mini-   │  │ archive  │ │
│  │ neurons  │  │ inter-column  │  │ column  │  │ + check- │ │
│  │ + hot    │  │ connectivity  │  │ state   │  │ points   │ │
│  │ columns  │  │ + spotlight   │  │ + over- │  │          │ │
│  │          │  │ override tbl  │  │ ride    │  │          │ │
│  │          │  │               │  │ table   │  │          │ │
│  └──────────┘  └──────────────┘  └─────────┘  └──────────┘ │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LAYER 1: NEURAL MASS (always running)                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  400 brain regions × Wilson-Cowan (2 ODEs each)         │ │
│  │  Memory: 6.4 KB | Speed: 1M+ ticks/sec on CPU          │ │
│  │  Purpose: Global dynamics, oscillations, attention      │ │
│  │           routing, salience detection                   │ │
│  │  Output: Activation level per region → drives Layer 2   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                          │                                    │
│                    salience signal                            │
│                          ▼                                    │
│  LAYER 2: MACROCOLUMN (background, GPU batch)                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  2M macrocolumns × 80-dim state vector                  │ │
│  │  Memory: 33 GB (RAM + partial VRAM)                     │ │
│  │  Speed: ~500-2000 ticks/sec on GPU                      │ │
│  │  Purpose: Regional computation, pattern formation,      │ │
│  │           inter-region communication                    │ │
│  │  Connectivity: 4B inter-macro connections (20 GB)       │ │
│  │  Output: Column activation patterns → selects spotlight │ │
│  └─────────────────────────────────────────────────────────┘ │
│                          │                                    │
│               top-K salience selection                        │
│                          ▼                                    │
│  LAYER 3: SPOTLIGHT (neuron-level, dynamic, GPU)             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  1-5% of brain = 860M-4.3B neurons (dynamic selection)  │ │
│  │  Procedural connectivity (GeNN-style, on-the-fly)       │ │
│  │  Memory: 4-20 GB VRAM for active neurons                │ │
│  │  Speed: 0.1-3 ticks/sec (depending on spotlight size)   │ │
│  │  Purpose: Fine-grained computation, learning (STDP),    │ │
│  │           conscious processing, working memory          │ │
│  │  Plasticity: Override table for modified synapses       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  LAYER 4: SDM MODULE (hippocampal memory)                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  1M hard locations × 1000-bit addresses                 │ │
│  │  Memory: 125 MB                                         │ │
│  │  Purpose: Episodic memory, pattern completion,          │ │
│  │           memory consolidation during "sleep" cycles    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Exact Memory Budget

| Component | Size | Location | Access Pattern |
|-----------|------|----------|---------------|
| Neural mass state (400 regions) | 6.4 KB | CPU L1 cache | Sequential |
| Neural mass connectivity (400²) | 640 KB | CPU L2 cache | Sequential |
| Macrocolumn state (2M × 80 × 4B) | 640 MB | GPU VRAM | Batch parallel |
| Macrocolumn intra-weights (2M × 80² × 1B) | 12.8 GB | GPU VRAM (shared) | Batch parallel |
| Inter-macro connectivity (4B × 5B) | 20 GB | System RAM (mmap) | Semi-random |
| Spotlight neuron state (860M × 1B) | 860 MB | GPU VRAM | Random |
| Spotlight procedural connectivity | 0 (computed) | GPU compute | Sequential per row |
| Plasticity override table | 1-10 GB | NVMe (mmap) | Random |
| SDM hard locations | 125 MB | System RAM | Hamming-nearest |
| Brain checkpoint (full dump) | ~50 GB | HDD | Sequential (rare) |
| **TOTAL ACTIVE** | **~35 GB** | **VRAM + RAM** | |

### Exact Compute Budget

```
Layer 1 (Neural Mass): 
  4000 FLOPs/tick × 1000 ticks per Layer 2 tick = 4M FLOPs
  CPU handles this trivially in background thread

Layer 2 (Macrocolumn):
  2M columns × 80 × 80 MACs (intra) = 12.8B ops/tick
  + 4B inter-column updates × ~10 FLOPs = 40B ops/tick
  Total: ~53B FLOPs/tick
  GPU at 13.2 TFLOPS: 53B / 13.2T = 4 ms/tick → ~250 ticks/sec
  
  BUT bandwidth-limited:
  2M × 80 × 4B = 640 MB state read + write = 1.28 GB/tick
  + 20 GB inter-column reads (sparse, ~10% active) = 2 GB/tick
  Total bandwidth: ~3.3 GB/tick
  At 384 GB/s: 3.3/384 = 8.6 ms/tick → ~116 ticks/sec
  
  Effective: ~116 ticks/sec (bandwidth-bound)

Layer 3 (Spotlight at 1% = 860M neurons):
  Fire rate 1%: 8.6M neurons spike
  Synapses per spike: ~7000
  Hash evaluations: 8.6M × 7000 = 60.2B
  At 16B hashes/sec (bandwidth-limited): 3.76 sec/tick
  
  Effective: ~0.27 ticks/sec

Layer 3 (Spotlight at 0.1% = 86M neurons):
  Fire rate 1%: 860K spikes
  Synapses: 860K × 7000 = 6.02B
  At 16B hashes/sec: 0.38 sec/tick
  
  Effective: ~2.6 ticks/sec

Layer 4 (SDM):
  Pattern store/recall: ~1 ms (GPU parallel Hamming)
  Negligible cost
```

### Performance Summary

| Configuration | Spotlight Size | Tick Rate | Brain-Time Ratio |
|--------------|---------------|-----------|-----------------|
| Layer 1 only | None | 1M/sec | 1000x faster |
| Layer 1+2 | None | 116/sec | ~8.6x slower |
| Layer 1+2+3 (conservative) | 0.1% (86M neurons) | 2.6/sec | ~385x slower |
| Layer 1+2+3 (moderate) | 1% (860M neurons) | 0.27/sec | ~3700x slower |
| Layer 1+2+3 (aggressive) | 5% (4.3B neurons) | 0.05/sec | ~20000x slower |

### What Cognitive Properties Survive

| Property | Status | Layer |
|----------|--------|-------|
| Inter-region oscillations (alpha, beta, gamma) | ✅ Full | L1+L2 |
| Resting-state networks (DMN, salience, etc.) | ✅ Good | L1+L2 |
| Global workspace / conscious access | ✅ Modeled | L1→L3 selection |
| Attentional routing | ✅ Modeled | L1 salience → L3 spotlight |
| Working memory | ⚠️ Partial | L3 (limited by spotlight size) |
| Synaptic plasticity / learning | ⚠️ In spotlight only | L3 STDP |
| Episodic memory | ⚠️ Simplified | L4 SDM |
| Dendritic computation | ❌ Lost | Requires multi-compartment models |
| Spike-timing precision | ❌ Lost in L1+L2 | Only in L3 |
| Neuromodulation (dopamine, serotonin) | ⚠️ Can be added | Global gain modulation on L2 |
| Motor output sequences | ⚠️ Partial | L3 spotlight on motor cortex |
| Language processing | ❌ Likely lost | Requires too many regions at neuron-level |

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (2-4 weeks)
- [ ] Implement Wilson-Cowan neural mass model (400 regions)
- [ ] Use TVB connectome data (freely available) for inter-region weights
- [ ] Validate against published resting-state dynamics
- [ ] **Stack**: Pure C++ on CPU, single-threaded
- [ ] **Deliverable**: 400-region oscillating brain, real-time+

### Phase 2: Macrocolumn Layer (4-8 weeks)
- [ ] Implement 2M macrocolumn model on GPU via Vulkan Compute
- [ ] Port inter-column connectivity to GPU-friendly format
- [ ] Implement bidirectional coupling: L1 ↔ L2
- [ ] **Stack**: Vulkan Compute (GLSL compute shaders) + C++ host
- [ ] **Deliverable**: 2M-column brain running at ~100 ticks/sec

### Phase 3: Spotlight Engine (8-12 weeks)
- [ ] Implement procedural connectivity kernel (Vulkan compute)
- [ ] Implement LIF (Leaky Integrate-and-Fire) neuron model on GPU
- [ ] Build dynamic spotlight selection (L1 salience → L3 zoom)
- [ ] Implement STDP plasticity within spotlight
- [ ] Implement override table (NVMe-backed mmap)
- [ ] **Deliverable**: Full hybrid system, ~1-3 ticks/sec at 0.1% spotlight

### Phase 4: Memory & Learning (12-16 weeks)
- [ ] Implement SDM module for episodic memory
- [ ] Implement "sleep cycles" — consolidation from L3 override table to L2 weights
- [ ] Implement neuromodulation (global gain parameters)
- [ ] **Deliverable**: Learning, memory-forming hybrid brain

### Phase 5: I/O & Behavior (16+ weeks)
- [ ] Sensory input pipeline (images → V1-like encoding)
- [ ] Motor output decoder
- [ ] Behavioral benchmarks
- [ ] **Deliverable**: A system that can "see" and "act"

---

## 10. CORE LOOP PSEUDOCODE

```c
// Main simulation loop
void brain_tick() {
    // LAYER 1: Neural Mass (CPU, every tick)
    for (int r = 0; r < 400; r++) {
        float E = regions[r].excitatory;
        float I = regions[r].inhibitory;
        float input = 0;
        for (int j = 0; j < 400; j++)
            input += W_region[r][j] * regions[j].excitatory;
        
        // Wilson-Cowan equations
        float dE = (-E + sigmoid(c1*E - c2*I + input + P[r])) / tau_E;
        float dI = (-I + sigmoid(c3*E - c4*I)) / tau_I;
        regions[r].excitatory += dE * dt;
        regions[r].inhibitory += dI * dt;
    }
    
    // Compute salience for spotlight selection
    float salience[400];
    for (int r = 0; r < 400; r++)
        salience[r] = abs(regions[r].excitatory - regions[r].baseline);
    int spotlight_regions[20]; // top-K salient regions
    top_k(salience, 400, spotlight_regions, 20);
    
    // LAYER 2: Macrocolumn (GPU, every tick)
    // Dispatch Vulkan compute shader
    vkCmdDispatch(cmd, 2000000 / 256, 1, 1); // 2M columns, 256 per workgroup
    // Shader: column_state[i] = tanh(W_intra[type[i]] @ column_state[i] 
    //                               + sum(W_inter[j→i] * column_state[j]))
    
    // LAYER 3: Spotlight (GPU, every tick, dynamic region)
    for (int s = 0; s < 20; s++) {
        int region = spotlight_regions[s];
        int n_start = region_neuron_offset[region];
        int n_count = region_neuron_count[region]; // ~430K neurons per region
        
        // Procedural connectivity kernel
        // For each spiking neuron, hash-generate postsynaptic targets
        vkCmdDispatch(cmd, n_count / 256, 1, 1);
        // Shader: for each neuron that spiked:
        //   for target in procedural_targets(neuron_id, seed):
        //     post_neuron[target].voltage += weight(neuron_id, target)
        //     if override_exists(neuron_id, target):
        //       post_neuron[target].voltage += override_delta
        
        // LIF neuron update
        // V[i] = V[i] * decay + input[i]
        // if V[i] > threshold: spike[i] = 1; V[i] = reset
    }
    
    // LAYER 4: SDM (CPU, periodic)
    if (tick % 1000 == 0) { // every ~second of brain time
        // Encode current spotlight pattern into SDM
        uint8_t address[125]; // 1000 bits
        encode_spotlight_to_sdm_address(spotlight_state, address);
        sdm_write(address, spotlight_state);
    }
    
    // PLASTICITY (in spotlight only)
    if (tick % 10 == 0) { // every 10ms of brain time
        // STDP: for each pre-post spike pair within ±20ms window
        // Δw = A+ * exp(-Δt/τ+) if pre before post
        // Δw = A- * exp(Δt/τ-) if post before pre
        // Write to override table (NVMe mmap)
    }
}
```

---

## 11. HONEST ASSESSMENT

### What Works ✅
1. **Multi-scale architecture is sound** — TVB, SpiNNaker, and the Human Brain Project all use similar hierarchical approaches
2. **Procedural connectivity is real** — GeNN proved it, published in Nature Computational Science
3. **33 GB macrocolumn layer fits your hardware** — this alone is a meaningful brain model
4. **~1-3 ticks/sec with 0.1% spotlight is achievable** — a 385x slowdown brain is still a brain
5. **Vulkan Compute on RX 6700 XT is rock-solid** — Mesa RADV driver is excellent

### What Doesn't Work ❌
1. **Full brain at neuron level** — physically impossible, 20,000x memory gap
2. **Real-time simulation** — minimum 385x slower than biology
3. **ROCm/HIP on gfx1031** — officially unsupported, risky
4. **Learning at scale** — STDP only in spotlight (0.1-1% of brain), rest is frozen
5. **Language, reasoning, consciousness** — these likely require neuron-level resolution across multiple regions simultaneously (Broca + Wernicke + prefrontal + temporal = >20% of cortex at neuron level = too slow)

### The Fundamental Insight

> **The brain's computational power isn't in its architecture — it's in the 352 TB of learned synaptic configuration. Any simulation that doesn't include those specific weight values is simulating "a brain," not "THE brain." And any simulation that DOES include them can't fit on consumer hardware.**

What you CAN build is a **brain-like dynamical system** that exhibits brain-like macro-behavior (oscillations, attention, learning in small regions) at greatly reduced temporal resolution. This is scientifically interesting and practically useful — it's exactly what TVB and SpiNNaker do.

---

## REFERENCES

1. Knight, J.C. & Nowotny, T. (2021). Larger GPU-accelerated brain simulations with procedural connectivity. *Nature Computational Science*, 1, 136-142. DOI: 10.1038/s43588-020-00022-7
2. Bartol, T.M. et al. (2015). Nanoconnectomic upper bound on the variability of synaptic plasticity. *eLife*, 4, e10778. [Salk 4.7 bits/synapse]
3. Mountcastle, V.B. (1997). The columnar organization of the neocortex. *Brain*, 120(4), 701-722.
4. Kanerva, P. (1988). *Sparse Distributed Memory*. MIT Press.
5. Wilson, H.R. & Cowan, J.D. (1972). Excitatory and Inhibitory Interactions in Localized Populations of Model Neurons. *Biophysical Journal*, 12(1), 1-24.
6. Sanz Leon, P. et al. (2013). The Virtual Brain: a simulator of primate brain network dynamics. *Frontiers in Neuroinformatics*, 7, 10.
7. Furber, S.B. et al. (2014). The SpiNNaker Project. *Proceedings of the IEEE*, 102(5), 652-665.
8. Douglas, R.J. & Martin, K.A. (2004). Neuronal circuits of the neocortex. *Annual Review of Neuroscience*, 27, 419-451.
9. Ganguli, S. & Sompolinsky, H. (2012). Compressed sensing, sparsity, and dimensionality in neuronal information processing and data analysis. *Annual Review of Neuroscience*, 35, 485-508.
10. Hawkins, J. & Ahmad, S. (2016). Why Neurons Have Thousands of Synapses, a Theory of Sequence Memory in Neocortex. *Frontiers in Neural Circuits*, 10, 23. [Numenta HTM]
11. GeNN v5 Documentation: https://genn-team.github.io/genn/documentation/5/
12. ROCm System Requirements: https://rocm.docs.amd.com/projects/install-on-linux/en/latest/reference/system-requirements.html
