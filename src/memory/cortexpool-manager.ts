/**
 * CortexPool Session Manager
 * 
 * Global singleton that manages CortexPool instances per workspace.
 * This integrates CortexPool into the session lifecycle.
 */

import { log } from "../agents/pi-embedded-runner/logger.js";
import { resolveCortexPoolConfig, type CortexPoolSessionConfig } from "./cortexpool-session.js";
import { 
  CortexPoolSessionMemory, 
  createCortexPoolSessionMemory 
} from "./cortexpool-session-memory.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { extractFactsFromMessage } from "./fact-extractor.js";
import type { OpenClawConfig } from "../config/config.js";

interface SessionMemoryEntry {
  memory: CortexPoolSessionMemory;
  config: CortexPoolSessionConfig;
}

// Per-workspace CortexPool instances
const workspaceMemories = new Map<string, SessionMemoryEntry>();

/**
 * Get or create CortexPool session memory for a workspace
 */
export async function getCortexPoolMemory(
  workspaceDir: string,
  sessionKey: string,
  config?: OpenClawConfig
): Promise<CortexPoolSessionMemory> {
  const key = `${workspaceDir}:${sessionKey}`;
  
  // Check if we already have an instance
  const existing = workspaceMemories.get(key);
  if (existing) {
    return existing.memory;
  }
  
  // Resolve config
  const cortexConfig = resolveCortexPoolConfig(config);
  
  // Skip if not enabled
  if (!cortexConfig.enabled) {
    const disabled = new CortexPoolSessionMemory(workspaceDir, sessionKey, {
      ...cortexConfig,
      enabled: false,
    });
    return disabled;
  }
  
  // Create new instance
  const memory = await createCortexPoolSessionMemory(workspaceDir, sessionKey, cortexConfig);
  
  // Only store if enabled
  if (memory.isEnabled()) {
    workspaceMemories.set(key, { memory, config: cortexConfig });
    log.info(`[CortexPool] Registered memory for ${key}`);
  }
  
  return memory;
}

/**
 * Check if CortexPool is available and enabled
 */
export function isCortexPoolEnabled(config?: OpenClawConfig): boolean {
  const cortexConfig = resolveCortexPoolConfig(config);
  return cortexConfig.enabled;
}

/**
 * Get the relevance pool context for injecting into prompts
 */
export function getCortexPoolContext(
  workspaceDir: string,
  sessionKey: string
): string {
  const key = `${workspaceDir}:${sessionKey}`;
  const entry = workspaceMemories.get(key);
  
  if (!entry || !entry.memory.isEnabled()) {
    return "";
  }
  
  return entry.memory.buildRelevancePoolContext();
}

/**
 * Extract facts from messages and add to CortexPool
 * Call this after agent runs to capture semantic memories
 */
export async function extractAndStoreFacts(params: {
  workspaceDir: string;
  sessionKey: string;
  messages: AgentMessage[];
  config?: OpenClawConfig;
}): Promise<number> {
  const { workspaceDir, sessionKey, messages, config } = params;
  
  // Skip if not enabled
  if (!isCortexPoolEnabled(config)) {
    return 0;
  }
  
  try {
    const memory = await getCortexPoolMemory(workspaceDir, sessionKey, config);
    
    if (!memory.isEnabled()) {
      return 0;
    }
    
    let factsAdded = 0;
    for (const msg of messages) {
      const facts = extractFactsFromMessage(msg, { sessionKey });
      for (const fact of facts) {
        await memory.onMessage(msg);
        factsAdded++;
      }
    }
    
    if (factsAdded > 0) {
      log.debug(`[CortexPool] Extracted ${factsAdded} facts from ${messages.length} messages`);
    }
    
    return factsAdded;
  } catch (err) {
    log.warn(`[CortexPool] Fact extraction failed: ${err}`);
    return 0;
  }
}

/**
 * Clean up CortexPool memory for a session
 */
export async function disposeCortexPoolMemory(
  workspaceDir: string,
  sessionKey: string
): Promise<void> {
  const key = `${workspaceDir}:${sessionKey}`;
  const entry = workspaceMemories.get(key);
  
  if (entry) {
    await entry.memory.dispose();
    workspaceMemories.delete(key);
    log.info(`[CortexPool] Disposed memory for ${key}`);
  }
}

/**
 * Get stats for debugging
 */
export function getCortexPoolStats(
  workspaceDir: string,
  sessionKey: string
): { messageCount: number; topicCount: number; relevancePoolSize: number; enabled: boolean } | null {
  const key = `${workspaceDir}:${sessionKey}`;
  const entry = workspaceMemories.get(key);
  
  if (!entry) {
    return null;
  }
  
  return entry.memory.getStats();
}
