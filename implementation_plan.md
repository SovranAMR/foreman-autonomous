# Implementation Plan

## Goal
Build a world-class corporate website for DAS Systems at public/index.html. Replace the existing file completely.

Requirements:
- Single-file HTML with inline CSS/JS — no external dependencies except Google Fonts, GSAP CDN, Lucide icons
- Cinematic, industrial, premium aesthetic — black (#050505) + amber/gold (#D4A574) theme
- Fonts: Playfair Display (headings) + Inter (body)
- GSAP ScrollTrigger animations for section reveals
- Canvas particle network background (connecting nodes, amber color)
- NO team info, NO client references/logos, NO ads/small services mentioned
- Target: factories, large enterprises, 300K-1M+ USD projects

Sections:
1. Hero: "Endüstriyel Geleceği Kodluyoruz" — large typography, particle canvas, CTAs
2. Capabilities (4 cards): AI Güvenlik & Fiziksel İzleme (DASVision), Endüstriyel Otomasyon (Mace/PLC/SCADA), Özel Yazılım & Entegrasyon (Eyrice Genel Takip), Veri & Kognitif Sistemler (Foreman/OpenClaw/Kobikom)
3. Technology Stack: 18 cells with icons — Next.js 16, React 19, TypeScript ESM, Python, C99/Vulkan, YOLO, ONNX, PostgreSQL, SQLite WAL, PocketBase, WebSocket, Docker, Railway, GSAP, Three.js, Tailwind v4, Framer Motion
4. Process: 5-step Forge Pipeline (Vision → Strategy → Research → Execution → Verify)
5. Contact: Minimal — email (ali@dassystems.com.tr), location (Bursa), direct CTA

Meta: Schema.org Organization, OpenGraph, Twitter Card, canonical, theme-color
SEO: Turkish language, proper meta tags, semantic HTML

After creating the file: git add public/index.html, commit with proper message, push to origin main. Fix Railway deployment if needed (currently dassystems.com.tr shows old site).

## Vision
**EMOTION TARGET**: Precision Power. The immediate, visceral sense that every pixel was CNC-machined rather than drawn in a design tool. The viewer should feel the same

## Proposed Changes (Blocks)
### Block 1
Create `public/index.html` as the complete, self-contained DAS Systems corporate website. The file must replace any existing content and include: Turkish-language semantic HTML5; inline CSS enforcing the black (#050505) and amber/gold (#D4A574) theme with Playfair Display headings and Inter body text; a full-screen Canvas particle-network background; GSAP ScrollTrigger reveal animations loaded from CDN; Lucide icons from CDN; Schema.org Organization JSON-LD, OpenGraph, Twitter Card, canonical, and theme-color meta tags; and all five specified sections (Hero with "Endüstriyel Geleceği Kodluyoruz", 4 capability cards, 18-cell technology stack, 5-step Forge Pipeline, minimal Contact). Forbidden content (team info, client references/logos, ads) must be absent. Acceptance Criteria: `public/index.html` exists and its MD5 checksum matches a file containing all required sections; `grep -E '<link.*stylesheet|<script.*src'` returns only Google Fonts, GSAP/ScrollTrigger, and Lucide CDN URLs; `grep -iE 'team|client|logo|referans'` returns zero matches inside the file; all five semantic section IDs are present.

### Block 2
Execute git workflow and verify Railway deployment. Stage `public/index.html`, commit with a message matching `^DAS Systems.*(rewrite|replace|corporate site)`, push to `origin main`, and verify that `dassystems.com.tr` serves the new content. If the live site still shows the old version, diagnose the Railway deployment configuration (e.g., build output directory, custom domain caching, or missing `public/` mapping) and apply deterministic fixes until the new site is live. Acceptance Criteria: `git log origin/main --oneline -1` contains the commit; `git push` exits with code 0; `curl -s https://dassystems.com.tr | grep -c "Endüstriyel Geleceği Kodluyoruz"` returns ≥1 (or equivalent DOM evidence of the new hero).

## Verification Plan
Automated tests and manual visual inspection.
