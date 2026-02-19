import type { Tool } from '../../agent';
import path from 'path';
import fs from 'fs';

let cortexPool: any = null;

async function getCortexPool() {
  if (!cortexPool) {
    const { CortexPool } = await import('../../workspace/src/cortex-pool.js');
    const dbPath = process.env.OPENCLAW_STATE_DIR 
      ? `${process.env.OPENCLAW_STATE_DIR}/cortexpool.db`
      : `${process.env.HOME || process.env.USERPROFILE}/.openclaw/cortexpool.db`;
    cortexPool = new CortexPool(dbPath);
  }
  return cortexPool;
}

// Load seed data from local file (NEVER commit this to git)
function loadSeedData(): any[] {
  const seedFile = process.env.OPENCLAW_STATE_DIR 
    ? `${process.env.OPENCLAW_STATE_DIR}/cortexpool-seed.json`
    : `${process.env.HOME || process.env.USERPROFILE}/.openclaw/cortexpool-seed.json`;
  
  if (fs.existsSync(seedFile)) {
    try {
      return JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

export const cortexpool_add_fact: Tool = {
  name: 'cortexpool_add_fact',
  description: 'Add a fact to the CortexPool memory graph',
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Entity the fact is about' },
      predicate: { type: 'string', description: 'Relationship type (knows, created, prefers, is, etc.)' },
      object: { type: 'string', description: 'Optional related entity' },
      content: { type: 'string', description: 'The fact text' },
      tier: { type: 'string', enum: ['episodic', 'semantic', 'structural'], default: 'semantic' },
      confidence: { type: 'number', default: 0.7 },
      source: { type: 'string', default: 'conversation' }
    },
    required: ['subject', 'predicate', 'content']
  },
  handler: async (params: any) => {
    const pool = await getCortexPool();
    const factId = pool.addFact(params);
    return { success: true, factId };
  }
};

export const cortexpool_search: Tool = {
  name: 'cortexpool_search',
  description: 'Search for facts about an entity',
  parameters: {
    type: 'object',
    properties: {
      entity: { type: 'string' },
      depth: { type: 'number', default: 1 }
    },
    required: ['entity']
  },
  handler: async ({ entity, depth = 1 }: any) => {
    const pool = await getCortexPool();
    const facts = pool.getRelatedFacts(entity, depth);
    return { entity, facts };
  }
};

export const cortexpool_topics: Tool = {
  name: 'cortexpool_topics',
  description: 'Set conversation topics for relevance scoring',
  parameters: {
    type: 'object',
    properties: {
      topics: { type: 'array', items: { type: 'string' } }
    },
    required: ['topics']
  },
  handler: async ({ topics }: any) => {
    const pool = await getCortexPool();
    pool.setTopics(topics);
    return { success: true, topics };
  }
};

export const cortexpool_get_pool: Tool = {
  name: 'cortexpool_get_pool',
  description: 'Get current relevance pool',
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    const pool = await getCortexPool();
    return { pool: pool.getPool() };
  }
};

export const cortexpool_use: Tool = {
  name: 'cortexpool_use',
  description: 'Mark a fact as used to increase importance',
  parameters: {
    type: 'object',
    properties: {
      factId: { type: 'number' }
    },
    required: ['factId']
  },
  handler: async ({ factId }: any) => {
    const pool = await getCortexPool();
    pool.useFact(factId);
    return { success: true };
  }
};

export const cortexpool_reflect: Tool = {
  name: 'cortexpool_reflect',
  description: 'Run reflection loop for memory maintenance',
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    const pool = await getCortexPool();
    const result = pool.reflect();
    return result;
  }
};

export const cortexpool_seed: Tool = {
  name: 'cortexpool_seed',
  description: 'Seed with facts from local file only (never from code)',
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    const pool = await getCortexPool();
    
    // Load seed data from LOCAL FILE ONLY - never hardcode personal data
    const seedData = loadSeedData();
    
    if (seedData.length > 0) {
      pool.bulkAdd(seedData);
      pool.refreshPool();
    }
    
    return { 
      success: true, 
      message: seedData.length > 0 
        ? `Seeded with ${seedData.length} facts from local file`
        : 'No seed data found. Add facts to cortexpool-seed.json in your state directory.'
    };
  }
};
