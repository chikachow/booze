# Model critic reviews as wine-vintage facts

Critic reviews are stored as separate facts attached to a wine-vintage record, not as score columns on the wine-vintage itself. Each review keeps its review source, provenance, and source-expressed score so the catalogue can represent multiple critics, scoring scales, and non-numeric ratings without pretending they are equivalent.

## Considered Options

We rejected a single critic-score field because recognised sources can disagree and use different scales. We rejected normalising all scores to a single scale as the canonical value because that would erase the source's expressed rating. We rejected copied critic review prose by default because score and provenance are enough for cellar evaluation, while copied review text creates avoidable licensing risk.

## Consequences

Critic reviews are editable enrichment metadata for a wine-vintage record. They may be maintained through the web UI or authenticated MCP tools, but they do not determine date-based drink status.
