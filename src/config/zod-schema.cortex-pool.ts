import { z } from "zod";

/**
 * CortexPool configuration schema for session memory management
 */
export const CortexPoolSchema = z
  .object({
    /** Enable CortexPool semantic memory */
    enabled: z.boolean().optional().describe("Enable CortexPool semantic memory"),
    /** Path to SQLite database (relative to workspace) */
    dbPath: z.string().optional().describe("Path to CortexPool database"),
    /** Number of facts to keep in relevance pool */
    relevancePoolSize: z.number().int().positive().optional().describe("Size of relevance pool"),
    /** Extract facts from every message */
    extractOnEveryMessage: z.boolean().optional().describe("Extract facts from every message"),
    /** Extract facts every N messages (more efficient) */
    extractEveryNMessages: z.number().int().positive().optional().describe("Extract facts every N messages"),
    /** Embedding endpoint for vector search */
    embeddingEndpoint: z.string().optional().describe("Embedding API endpoint"),
    /** Embedding model name */
    embeddingModel: z.string().optional().describe("Embedding model name"),
    /** Run reflection periodically to maintain memory */
    autoReflect: z.boolean().optional().describe("Enable automatic memory reflection"),
    /** Run reflection every N messages */
    reflectIntervalMessages: z.number().int().positive().optional().describe("Messages between reflections"),
    /** Trigger semantic context when context is X% full (earlier = better comprehension) */
    triggerThreshold: z.number().min(0).max(1).optional().describe("Context ratio to trigger semantic memory"),
    /** Sync facts to TPC server */
    syncToTPC: z.boolean().optional().describe("Sync facts to TPC server"),
    /** TPC server URL */
    tpcUrl: z.string().optional().describe("TPC server URL"),
  })
  .strict()
  .optional()
  .describe("CortexPool semantic memory configuration");
