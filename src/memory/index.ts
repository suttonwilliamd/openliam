export { MemoryIndexManager } from "./manager.js";
export type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";
export { getMemorySearchManager, type MemorySearchManagerResult } from "./search-manager.js";

// CortexPool Session Memory exports
export {
  DEFAULT_CORTEXPOOL_CONFIG,
  resolveCortexPoolConfig,
  resolveCortexPoolDbPath,
} from "./cortexpool-session.js";
export type { CortexPoolSessionConfig } from "./cortexpool-session.js";
export {
  CortexPoolSessionMemory,
  createCortexPoolSessionMemory,
} from "./cortexpool-session-memory.js";
export {
  extractFactsFromMessage,
  extractTopicsFromMessages,
} from "./fact-extractor.js";
export type { ExtractedFact } from "./fact-extractor.js";

// CortexPool Manager exports
export {
  getCortexPoolMemory,
  isCortexPoolEnabled,
  getCortexPoolContext,
  disposeCortexPoolMemory,
  getCortexPoolStats,
  extractAndStoreFacts,
} from "./cortexpool-manager.js";
