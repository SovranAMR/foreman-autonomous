/**
 * FOREMAN — Model Discovery Service
 *
 * Automatically discovers available models from the Cloud Code Assist API
 * and caches them locally. Falls back to hardcoded defaults on failure.
 *
 * Cache: ~/.foreman/models-cache.json (1-hour TTL)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AntigravityCredentials } from "./antigravity-oauth.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface DiscoveredModel {
    /** Internal model ID as returned by the API */
    id: string;
    /** Human-readable display name */
    displayName: string;
}

interface ModelsCache {
    /** Timestamp (ms) when the cache was written */
    fetchedAt: number;
    /** Discovered models */
    models: DiscoveredModel[];
}

// ─── CONFIG ──────────────────────────────────────────────────

const CACHE_FILE = join(homedir(), ".foreman", "models-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const ENDPOINTS = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
];

const DEFAULT_VERSION = "1.18.3";

// ─── CACHE ───────────────────────────────────────────────────

function readCache(): ModelsCache | null {
    if (!existsSync(CACHE_FILE)) return null;
    try {
        const data: ModelsCache = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
        // Check TTL
        if (Date.now() - data.fetchedAt > CACHE_TTL_MS) return null;
        if (!Array.isArray(data.models) || data.models.length === 0) return null;
        return data;
    } catch {
        return null;
    }
}

function writeCache(models: DiscoveredModel[]): void {
    try {
        const dir = join(homedir(), ".foreman");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const cache: ModelsCache = { fetchedAt: Date.now(), models };
        writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
    } catch {
        // Silent fail — cache is non-critical
    }
}

// ─── API FETCH ───────────────────────────────────────────────

async function fetchFromAPI(creds: AntigravityCredentials): Promise<DiscoveredModel[]> {
    const version = process.env.FOREMAN_ANTIGRAVITY_VERSION || DEFAULT_VERSION;
    const platform = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";

    const headers: Record<string, string> = {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": `antigravity/${version} ${platform}/${arch}`,
        "X-Goog-Api-Client": `gl-node/${process.versions.node} antigravity/${version}`,
    };

    for (const endpoint of ENDPOINTS) {
        try {
            const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
                method: "POST",
                headers,
                body: JSON.stringify({ project: creds.projectId }),
            });

            if (!response.ok) continue;

            const data = (await response.json()) as Record<string, unknown>;

            const modelsMap = data.models as Record<string, Record<string, unknown>> | undefined;
            if (!modelsMap) continue;

            const models: DiscoveredModel[] = [];
            for (const [id, info] of Object.entries(modelsMap)) {
                models.push({
                    id,
                    displayName: (info.displayName as string) || id,
                });
            }

            if (models.length > 0) return models;
        } catch {
            // Try next endpoint
        }
    }

    return [];
}

// ─── PUBLIC API ──────────────────────────────────────────────

/**
 * Get available models — from cache if fresh, otherwise from API.
 * Returns empty array if both fail (caller should use hardcoded fallback).
 */
export async function discoverModels(creds: AntigravityCredentials): Promise<DiscoveredModel[]> {
    // 1. Try cache first (fast path)
    const cached = readCache();
    if (cached) return cached.models;

    // 2. Fetch from API
    try {
        const models = await fetchFromAPI(creds);
        if (models.length > 0) {
            writeCache(models);
            return models;
        }
    } catch {
        // Fall through
    }

    return [];
}

/**
 * Get cached models synchronously (for non-async contexts).
 * Returns null if no valid cache exists.
 */
export function getCachedModels(): DiscoveredModel[] | null {
    const cached = readCache();
    return cached ? cached.models : null;
}
