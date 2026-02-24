/**
 * CortexPool Session Memory Integration for OpenLiam
 * 
 * Provides semantic memory with relevance pooling to prevent context overflow.
 * Instead of raw message history, we extract facts into a graph and maintain
 * a sliding window of "hot" facts based on current conversation topics.
 */

import path from "node:path";
import { resolveUserPath } from "../utils.js";
import type { OpenClawConfig } from "../config/config.js";

export { CortexPool } from "cortexpool";
export type { CortexPool as CortexPoolInstance } from "cortexpool";

// Default config
export const DEFAULT_CORTEXPOOL_CONFIG: CortexPoolSessionConfig = {
  enabled: false,
  dbPath: "./cortexpool.db",
  relevancePoolSize: 20,
  extractOnEveryMessage: true,
  embeddingEndpoint: "http://127.0.0.1:1234/v1",
  embeddingModel: "nomic-embed-text",
  autoReflect: true,
  reflectIntervalMessages: 50,
  // Trigger compression when context is 30% full (earlier = better comprehension)
  triggerThreshold: 0.3,
  // Sync facts to TPC server for persistence
  syncToTPC: true,
  tpcUrl: "http://localhost:3000",
  // Extract facts every N messages (more efficient than every message)
  extractEveryNMessages: 5,
};

export interface CortexPoolSessionConfig {
  /** Enable CortexPool memory (opt-in) */
  enabled: boolean;
  /** Path to SQLite database (relative to workspace) */
  dbPath: string;
  /** Number of facts to keep in relevance pool */
  relevancePoolSize: number;
  /** Extract facts from every message */
  extractOnEveryMessage: boolean;
  /** Extract facts every N messages (more efficient) */
  extractEveryNMessages: number;
  /** Embedding endpoint for vector search */
  embeddingEndpoint: string;
  /** Embedding model name */
  embeddingModel: string;
  /** Run reflection periodically to maintain memory */
  autoReflect: boolean;
  /** Run reflection every N messages */
  reflectIntervalMessages: number;
  /** Trigger semantic context when context is X% full */
  triggerThreshold: number;
  /** Sync facts to TPC server */
  syncToTPC: boolean;
  /** TPC server URL */
  tpcUrl: string;
}

/**
 * Resolve CortexPool config from OpenLiam config
 */
export function resolveCortexPoolConfig(config: OpenClawConfig | undefined): CortexPoolSessionConfig {
  const cfg = config?.agents?.defaults?.cortexPool;
  if (!cfg) {
    return DEFAULT_CORTEXPOOL_CONFIG;
  }
  return {
    ...DEFAULT_CORTEXPOOL_CONFIG,
    ...(cfg.enabled !== undefined && { enabled: cfg.enabled }),
    ...(cfg.dbPath && { dbPath: cfg.dbPath }),
    ...(cfg.relevancePoolSize && { relevancePoolSize: cfg.relevancePoolSize }),
    ...(cfg.embeddingEndpoint && { embeddingEndpoint: cfg.embeddingEndpoint }),
    ...(cfg.embeddingModel && { embeddingModel: cfg.embeddingModel }),
    ...(cfg.autoReflect !== undefined && { autoReflect: cfg.autoReflect }),
    ...(cfg.reflectIntervalMessages && { reflectIntervalMessages: cfg.reflectIntervalMessages }),
    ...(cfg.extractEveryNMessages && { extractEveryNMessages: cfg.extractEveryNMessages }),
    ...(cfg.triggerThreshold !== undefined && { triggerThreshold: cfg.triggerThreshold }),
    ...(cfg.syncToTPC !== undefined && { syncToTPC: cfg.syncToTPC }),
    ...(cfg.tpcUrl && { tpcUrl: cfg.tpcUrl }),
  };
}

/**
 * Get the resolved database path for a workspace
 */
export function resolveCortexPoolDbPath(workspaceDir: string, dbPath: string): string {
  const resolved = resolveUserPath(workspaceDir);
  return path.join(resolved, dbPath);
}
