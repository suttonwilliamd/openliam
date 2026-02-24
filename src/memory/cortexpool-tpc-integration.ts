/**
 * CortexPool + TPC Server Integration
 * 
 * Two-way sync between semantic memory and TPC context
 * 
 * ## Architecture
 * 
 * ```
 * Conversation
 *     ↓
 * CortexPool extracts facts
 *     ↓
 * Sync to TPC /thoughts (持久化)
 *     ↓
 * Session start → Query TPC /context
 *     ↓
 * Relevant facts → My context
 * ```
 * 
 * ## API Integration
 * 
 * ### 1. Sync Facts to TPC
 * 
 * POST http://localhost:3000/thoughts
 * {
 *   "content": "User is working on OpenLiam CortexPool integration",
 *   "tags": ["cortexpool", "session-xyz", "project:openliam"]
 * }
 * 
 * ### 2. Query TPC for Context
 * 
 * GET http://localhost:3000/context?search=openliam,cortexpool
 * 
 * Response includes `thoughts` array with relevant memories
 * 
 * ## Implementation Plan
 * 
 * Phase 1: Sync facts from CortexPool → TPC
 * - Add sync function to CortexPoolSessionMemory
 * - Call after fact extraction
 * 
 * Phase 2: Query TPC on session start
 * - Modify session initialization to fetch relevant thoughts
 * - Inject into context
 * 
 * Phase 3: Use CortexPool for smarter queries
 * - Instead of simple search, use CortexPool's graph ranking
 * - Hybrid: TPC storage + CortexPool semantic search
 */

const TPC_BASE_URL = process.env.TPC_URL || "http://localhost:3000";

/**
 * Sync a CortexPool fact to TPC as a thought
 */
export async function syncFactToTPC(fact: {
  subject: string;
  predicate: string;
  object: string;
  content: string;
  tier: string;
}, sessionKey: string): Promise<void> {
  const response = await fetch(`${TPC_BASE_URL}/thoughts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: fact.content,
      tags: [
        "cortexpool",
        `session:${sessionKey.slice(0, 8)}`,
        `tier:${fact.tier}`,
        `subject:${fact.subject}`,
      ],
    }),
  });
  
  if (!response.ok) {
    console.warn(`[CortexPool→TPC] Failed to sync: ${response.status}`);
  }
}

/**
 * Query TPC for relevant thoughts/context
 */
export async function queryTPCContext(searchTerms: string[]): Promise<string[]> {
  const query = searchTerms.join(",");
  const response = await fetch(`${TPC_BASE_URL}/context?search=${encodeURIComponent(query)}`);
  
  if (!response.ok) {
    console.warn(`[TPC→CortexPool] Query failed: ${response.status}`);
    return [];
  }
  
  const data = await response.json();
  return (data.thoughts || []).map((t: any) => t.content);
}
