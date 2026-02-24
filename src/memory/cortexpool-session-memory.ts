/**
 * CortexPool Session Memory Manager
 * 
 * Manages semantic memory for a session using CortexPool.
 * Handles fact extraction, relevance pooling, and context injection.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { log } from "../agents/pi-embedded-runner/logger.js";
import {
  type CortexPoolSessionConfig,
  type CortexPoolInstance,
  resolveCortexPoolConfig,
  resolveCortexPoolDbPath,
  DEFAULT_CORTEXPOOL_CONFIG,
} from "./cortexpool-session.js";
import { extractFactsFromMessage, extractTopicsFromMessages } from "./fact-extractor.js";
import { syncFactToTPC } from "./cortexpool-tpc-integration.js";

interface PoolFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  content: string;
  tier: string;
  importance: number;
  lastUsed: number;
}

export class CortexPoolSessionMemory {
  private pool: CortexPoolInstance | null = null;
  private config: CortexPoolSessionConfig;
  private messageCount = 0;
  private topics: string[] = [];
  private relevancePool: PoolFact[] = [];
  private initialized = false;
  private workspaceDir: string;
  private sessionKey: string;

  constructor(workspaceDir: string, sessionKey: string, config?: CortexPoolSessionConfig) {
    this.workspaceDir = workspaceDir;
    this.sessionKey = sessionKey;
    this.config = config ?? DEFAULT_CORTEXPOOL_CONFIG;
  }

  /**
   * Initialize the CortexPool connection
   */
  async initialize(): Promise<boolean> {
    if (this.initialized || !this.config.enabled) {
      return this.config.enabled;
    }

    try {
      // Dynamic import to handle optional dependency
      const { CortexPool } = await import("cortexpool");
      
      const dbPath = resolveCortexPoolDbPath(this.workspaceDir, this.config.dbPath);
      
      this.pool = new CortexPool(dbPath) as unknown as CortexPoolInstance;
      
      this.initialized = true;
      log.info(`[CortexPool] Initialized for session ${this.sessionKey} at ${dbPath}`);
      return true;
    } catch (err) {
      log.warn(`[CortexPool] Failed to initialize: ${err}`);
      this.config.enabled = false;
      return false;
    }
  }

  /**
   * Check if CortexPool is enabled and initialized
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Process a new message - extract facts and update memory
   */
  async onMessage(msg: AgentMessage): Promise<void> {
    if (!this.isEnabled()) return;

    this.messageCount++;

    // Extract facts from the message
    const facts = extractFactsFromMessage(msg, { sessionKey: this.sessionKey });
    
    // Add facts to the graph
    for (const fact of facts) {
      try {
        // @ts-expect-error - CortexPool types may not be fully exported
        this.pool.addFact({
          subject: fact.subject,
          predicate: fact.predicate as any,
          object: fact.object,
          content: fact.content,
          tier: fact.tier,
        });
        
        // Sync to TPC if enabled
        if (this.config.syncToTPC && this.config.tpcUrl) {
          syncFactToTPC(fact, this.sessionKey).catch(err => {
            log.warn(`[CortexPool→TPC] Sync failed: ${err}`);
          });
        }
      } catch (err) {
        log.warn(`[CortexPool] Failed to add fact: ${err}`);
      }
    }

    // Update topics from recent messages (would need access to message history)
    // For now, extract from current message
    const text = this.extractText(msg);
    if (text) {
      const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      for (const word of words.slice(0, 3)) {
        if (!this.topics.includes(word)) {
          this.topics.push(word);
          if (this.topics.length > 10) {
            this.topics.shift();
          }
        }
      }
    }

    // Update relevance pool
    await this.updateRelevancePool();

    // Run reflection periodically
    if (this.config.autoReflect && this.messageCount % this.config.reflectIntervalMessages === 0) {
      this.runReflection().catch(err => {
        log.warn(`[CortexPool] Reflection failed: ${err}`);
      });
    }
  }

  /**
   * Update the relevance pool based on current topics
   */
  private async updateRelevancePool(): Promise<void> {
    if (!this.pool || !this.isEnabled()) return;

    try {
      const facts = this.pool.retrieve(this.topics, {
        poolSize: this.config.relevancePoolSize,
      });
      
      this.relevancePool = (facts || []).map((f: unknown) => {
        const fact = f as Record<string, unknown>;
        return {
          id: String(fact.id || fact.subject || Math.random()),
          subject: String(fact.subject || ""),
          predicate: String(fact.predicate || ""),
          object: String(fact.object || ""),
          content: String(fact.content || ""),
          tier: String(fact.tier || "semantic"),
          importance: Number(fact.importance) || 1,
          lastUsed: Number(fact.lastUsed) || Date.now(),
        };
      });
    } catch (err) {
      log.warn(`[CortexPool] Failed to update relevance pool: ${err}`);
    }
  }

  /**
   * Run reflection to maintain and consolidate memory
   */
  async runReflection(): Promise<void> {
    if (!this.pool || !this.isEnabled()) return;

    try {
      await this.pool.reflect();
      log.debug(`[CortexPool] Reflection completed for ${this.sessionKey}`);
    } catch (err) {
      log.warn(`[CortexPool] Reflection error: ${err}`);
    }
  }

  /**
   * Get the relevance pool facts for context injection
   */
  getRelevancePoolFacts(): PoolFact[] {
    return this.relevancePool;
  }

  /**
   * Build context text from relevance pool
   */
  buildRelevancePoolContext(): string {
    if (this.relevancePool.length === 0) {
      return "";
    }

    const lines = ["## Relevant Memory"];
    
    // Group by tier
    const byTier = new Map<string, PoolFact[]>();
    for (const fact of this.relevancePool) {
      const tier = fact.tier || "semantic";
      if (!byTier.has(tier)) {
        byTier.set(tier, []);
      }
      byTier.get(tier)!.push(fact);
    }

    // Output by tier
    for (const [tier, facts] of byTier) {
      lines.push(`\n### ${tier.charAt(0).toUpperCase() + tier.slice(1)} Memory`);
      for (const fact of facts.slice(0, 5)) {
        lines.push(`- ${fact.content}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get current topics
   */
  getTopics(): string[] {
    return [...this.topics];
  }

  /**
   * Set topics explicitly (e.g., from system prompt analysis)
   */
  setTopics(topics: string[]): void {
    this.topics = topics.slice(0, 10);
    this.updateRelevancePool().catch(() => {});
  }

  /**
   * Check if context is getting full and we should start using semantic memory
   * Uses configurable threshold (default 30% for early extraction)
   */
  shouldUseSemanticContext(currentTokens: number, contextWindowTokens: number): boolean {
    const ratio = currentTokens / contextWindowTokens;
    // Start using semantic memory at configured threshold (default 30% for better comprehension)
    return ratio > (this.config.triggerThreshold || 0.3);
  }

  /**
   * Get memory stats
   */
  getStats(): { messageCount: number; topicCount: number; relevancePoolSize: number; enabled: boolean } {
    return {
      messageCount: this.messageCount,
      topicCount: this.topics.length,
      relevancePoolSize: this.relevancePool.length,
      enabled: this.isEnabled(),
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close?.();
      } catch {
        // Ignore cleanup errors
      }
      this.pool = null;
    }
    this.initialized = false;
  }

  private extractText(msg: AgentMessage): string {
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    
    const parts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object") {
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join(" ");
  }
}

/**
 * Factory function to create CortexPool session memory
 */
export async function createCortexPoolSessionMemory(
  workspaceDir: string,
  sessionKey: string,
  config?: CortexPoolSessionConfig
): Promise<CortexPoolSessionMemory> {
  const memory = new CortexPoolSessionMemory(workspaceDir, sessionKey, config);
  await memory.initialize();
  return memory;
}
