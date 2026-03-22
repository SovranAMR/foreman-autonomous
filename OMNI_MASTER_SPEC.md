# OMNI MASTER SPECIFICATION

## 1. VISION & EMOTION TARGET
**Emotion Target:** Omnipotence and absolute clarity. The user is observing disparate streams of consciousness from a single, elevated, frictionless vantage point.

**Focal Point:** The "Cumulative Follower" metric and the Omni ID in the Profile screen. It visually anchors the user as the center of gravity for all platforms. In the Feed, the focal point is the content itself, stripped of native platform noise.

## 2. ARCHITECTURE & CORE FEATURES
### 2.1 Headless WebView
To achieve unified multi-platform operations (auth, scraping, background interactions) without cluttering the UI, the system utilizes a Headless WebView architecture.
- **Mandate:** WebView components MUST NEVER interact with the visual layout.
- **Strict Implementation:** All WebViews must explicitly use the following styling:
  `position: 'absolute', top: -1000, width: 0, height: 0`

### 2.2 Functional Modules
- **Mixed / Karma Feed:** A singular feed stream presenting content from disparate platforms (X, IG, TikTok) unified into a pristine mozaik (masonry) and vertical flow.
- **Universal Inbox:** A unified message stream aggregating DMs and notifications across all integrated platforms.
- **Cross-Posting:** Frictionless "create once, distribute everywhere" capability, stripped of platform-specific UI variations.

## 3. DESIGN SYSTEM & PHILOSOPHY
### 3.1 Color Constants
1. **Void Obsidian (`#050505`)**: The background. Deep, borderless, creating an infinite canvas for the mixed feed.
2. **Stellar White (`#F9F9F9`)**: Primary typography and iconography. High contrast, clinical legibility.
3. **Omni Hologram (Linear Gradient `#7000FF` to `#00E5FF`)**: Used EXCLUSIVELY for cumulative metrics and the Omni ID to represent unified multi-platform energy.

### 3.2 Typography Hierarchy
- **Omni Identity (Metrics/ID):** System Sans-Serif (Inter/SF Pro), 40pt+, Ultra-Bold, tight tracking (-1px).
- **Feed Content:** 15pt, Medium weight, 140% line height. Highly legible, optimized for scrolling.
- **Platform Metadata:** 12pt, Regular, muted opacity (60%).

### 3.3 Space Philosophy
- **Edge-to-edge immersion:** 0px horizontal padding on masonry images.
- **Text & Headers:** 16px uniform padding only.
- **Grid Layouts:** Must rely on gaps (2px-4px) rather than borders.

## 4. MOTION BUDGET
- **Maximum 2 explicit animations:**
  1. **Tab Bar Switching:** 200ms spring physics, purely functional.
  2. **Masonry Stagger:** 150ms fade-and-slide-up for masonry grid items to prevent jarring pop-ins.
- **WebView Operations:** Zero visible motion. Headless execution only.

Constraint: Platform-branded primary colors are explicitly banned from dominating the UI. The authorized palette is exclusively restricted to Void Obsidian, Stellar White, and Omni Hologram. Platform representation must be limited to small icons.
- Restrict social media brand colors to small icons only; avoid large colored headers.
- NO visible borders between masonry grid items (use margin/gap exclusively).
- NO generic loading spinners (use skeleton screens instead).
- NO web-like scrolling artifacts in the React Native configuration.