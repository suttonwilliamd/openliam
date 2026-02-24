/**
 * Fact Extraction from Session Messages
 * 
 * Extracts semantic facts from user/assistant messages to store in CortexPool.
 * Uses simple pattern matching and entity extraction.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  content: string;
  tier: "episodic" | "semantic" | "structural";
  sourceMessageId?: string;
  timestamp?: number;
}

// Patterns for extracting facts from messages
const ENTITY_PATTERNS = [
  // "I am X", "My name is X"
  { pattern: /(?:i am|my name is|i'm)\s+(\w+)/i, predicate: "is", tier: "semantic" },
  // "X is a Y"
  { pattern: /(\w+)\s+is\s+(?:a|an)\s+(\w+)/i, predicate: "is_a", tier: "semantic" },
  // "I like X"
  { pattern: /(?:i like|i love|i prefer)\s+(\w+)/i, predicate: "likes", tier: "semantic" },
  // "I work on X"
  { pattern: /(?:i work on|i building|i creating)\s+([^\.]+)/i, predicate: "works_on", tier: "semantic" },
  // "X created Y"
  { pattern: /(\w+)\s+(?:created|built|made)\s+([^\.]+)/i, predicate: "created", tier: "semantic" },
  // "X uses Y"
  { pattern: /(\w+)\s+(?:uses?|using)\s+([^\.]+)/i, predicate: "uses", tier: "semantic" },
  // Meeting patterns: "we need X" → requirement
  { pattern: /(?:we need|need to|have to|must)\s+([^\.]+)/i, predicate: "needs", tier: "semantic" },
  // Meeting patterns: "let's" → proposal
  { pattern: /(?:let's|let us|how about|what about)\s+([^\.]+)/i, predicate: "proposes", tier: "semantic" },
  // Meeting patterns: "agree" → consensus
  { pattern: /(?:i agree|that's a good|that works|we have consensus|let's finalize)/i, predicate: "agrees", tier: "semantic" },
  // Meeting patterns: "too expensive" → constraint
  { pattern: /(?:too expensive|too costly|cost constraint|budget|can't afford)/i, predicate: "constraint", tier: "semantic" },
  // Meeting patterns: "my X can't use" → accessibility
  { pattern: /(?:can't use|can't handle|would never|would be confused)/i, predicate: "accessibility_concern", tier: "semantic" },
  // Meeting patterns: "for Y users" → user segment
  { pattern: /(?:for (?:young|old|older|basic|advanced) (?:users?|demographic|people))/i, predicate: "user_segment", tier: "semantic" },
  // Meeting patterns: "color coding" → feature
  { pattern: /(?:color (?:coding|co?l?o?red?)|color-coded)/i, predicate: "considers", tier: "semantic" },
  // Meeting patterns: "shape" → design element
  { pattern: /(?:shapes?|shaped|form factor|ergonomic)/i, predicate: "design", tier: "semantic" },
];

// Tool result patterns - extract facts from tool usage
const TOOL_RESULT_PATTERNS = [
  // Git operations
  { pattern: /commit[:\s]+([a-f0-9]+)/i, predicate: "committed", tier: "episodic" },
  { pattern: /branch[:\s]+(\S+)/i, predicate: "has_branch", tier: "episodic" },
  { pattern: /merged?\s+(\S+)/i, predicate: "merged", tier: "episodic" },
  // File operations
  { pattern: /created\s+([^\.]+\.\w+)/i, predicate: "created_file", tier: "episodic" },
  { pattern: /modified\s+([^\.]+\.\w+)/i, predicate: "modified_file", tier: "episodic" },
  { pattern: /deleted\s+([^\.]+\.\w+)/i, predicate: "deleted_file", tier: "episodic" },
  // Error patterns
  { pattern: /error[:\s]+([^\.]+)/i, predicate: "had_error", tier: "episodic" },
  { pattern: /failed[:\s]+([^\.]+)/i, predicate: "failed", tier: "episodic" },
  // Success patterns
  { pattern: /success(?:ful|ly)?[:\s]+([^\.]+)/i, predicate: "succeeded", tier: "episodic" },
  { pattern: /completed[:\s]+([^\.]+)/i, predicate: "completed", tier: "episodic" },
];

/**
 * Extract text content from a message
 */
function extractTextContent(msg: AgentMessage): string {
  const content = (msg as { content?: unknown }).content;
  
  if (typeof content === "string") {
    return content;
  }
  
  if (!Array.isArray(content)) {
    return "";
  }
  
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string") {
      parts.push(text);
    }
    
    // Also extract thinking from assistant messages
    const thinking = (block as { thinking?: unknown }).thinking;
    if (typeof thinking === "string") {
      parts.push(`[thinking: ${thinking.slice(0, 200)}]`);
    }
  }
  
  return parts.join(" ");
}

/**
 * Extract entities and facts from a message
 */
export function extractFactsFromMessage(
  msg: AgentMessage,
  options: { sessionKey?: string } = {}
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const text = extractTextContent(msg);
  const role = msg.role;
  const timestamp = Date.now();
  
  if (!text || text.length < 10) {
    return facts;
  }
  
  // Extract based on message role
  if (role === "user") {
    // Extract preferences, identity, etc from user messages
    for (const { pattern, predicate, tier } of ENTITY_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        facts.push({
          subject: "user",
          predicate,
          object: match[1].trim(),
          content: `User ${predicate} ${match[1].trim()}`,
          tier: tier as "episodic" | "semantic" | "structural",
          timestamp,
        });
      }
    }
    
    // Extract project/topic mentions
    const projectMentions = extractProjectMentions(text);
    for (const project of projectMentions) {
      facts.push({
        subject: "conversation",
        predicate: "topic",
        object: project,
        content: `Conversation topic: ${project}`,
        tier: "episodic",
        timestamp,
      });
    }
  }
  
  if (role === "assistant") {
    // Extract decisions
    if (text.includes("decided") || text.includes("chose") || text.includes("choice")) {
      facts.push({
        subject: "session",
        predicate: "decision",
        object: text.slice(0, 100),
        content: `Decision made: ${text.slice(0, 100)}`,
        tier: "episodic",
        timestamp,
      });
    }
    
    // Extract tool usages
    const toolCalls = (msg as { toolCalls?: unknown[] }).toolCalls;
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const toolCall of toolCalls) {
        const toolName = (toolCall as { name?: string }).name;
        if (toolName) {
          facts.push({
            subject: "assistant",
            predicate: "used_tool",
            object: toolName,
            content: `Assistant used tool: ${toolName}`,
            tier: "episodic",
            timestamp,
          });
        }
      }
    }
  }
  
  if (role === "toolResult") {
    const toolName = (msg as { toolName?: string }).toolName;
    
    // Extract from tool results
    for (const { pattern, predicate, tier } of TOOL_RESULT_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        facts.push({
          subject: toolName || "tool",
          predicate,
          object: match[1].trim(),
          content: `Tool ${predicate}: ${match[1].trim()}`,
          tier: tier as "episodic" | "semantic" | "structural",
          timestamp,
        });
      }
    }
    
    // Always record what tool was called
    if (toolName) {
      facts.push({
        subject: "session",
        predicate: "tool_result",
        object: toolName,
        content: `Tool result from: ${toolName}`,
        tier: "episodic",
        timestamp,
      });
    }
  }
  
  return facts;
}

/**
 * Extract project/topic names from text
 */
function extractProjectMentions(text: string): string[] {
  const projects: string[] = [];
  
  // Common project patterns
  const patterns = [
    /(?:working on|building|creating|coding)\s+([A-Z][a-zA-Z0-9_-]+)/g,
    /(?:project|app|feature)\s+([A-Z][a-zA-Z0-9_-]+)/g,
    /#(\w+)/g, // Hashtags
  ];
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        projects.push(match[1]);
      }
    }
  }
  
  return [...new Set(projects)]; // Dedupe
}

/**
 * Extract topics from recent messages for relevance pool
 */
export function extractTopicsFromMessages(messages: AgentMessage[]): string[] {
  const topicCounts = new Map<string, number>();
  
  for (const msg of messages.slice(-10)) { // Last 10 messages
    const text = extractTextContent(msg).toLowerCase();
    
    // Simple keyword extraction
    const words = text.split(/\W+/).filter(w => w.length > 3);
    
    // Count word frequency
    for (const word of words) {
      // Skip common words
      if (["there", "have", "been", "from", "that", "this", "with", "will", "would", "could", "should"].includes(word)) {
        continue;
      }
      
      topicCounts.set(word, (topicCounts.get(word) || 0) + 1);
    }
  }
  
  // Sort by frequency and return top topics
  return [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}
