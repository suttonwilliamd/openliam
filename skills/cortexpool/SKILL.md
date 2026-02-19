# CortexPool Skill

Use this skill to manage structured memory with entities, relationships, and relevance pooling.

## What It Does

CortexPool stores facts as a graph:
- **Entities**: People, projects, concepts (nodes)
- **Facts**: Relationships between entities (edges)
- **Relevance Pool**: Top facts relevant to current conversation

## Security Note

**NEVER** hardcode personal data in this skill or commit it to git.
Seed data is loaded from a local JSON file in the state directory only.

## Tools

### cortexpool_add_fact
Add a fact to the graph.

### cortexpool_search
Search for facts about an entity.

### cortexpool_topics
Set conversation topics for relevance scoring.

### cortexpool_get_pool
Get current relevance pool.

### cortexpool_use
Mark a fact as used (increases importance).

### cortexpool_reflect
Run reflection loop (decay, compress, clean up).

### cortexpool_seed
Seed with facts from local file only (NEVER from hardcoded data).
