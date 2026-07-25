# Critic Review Plan

This plan records the agreed direction for adding recognised critic reviews to Booze. It is a handoff document for implementation work on `z/implement`.

## Agreed Model

Critic reviews are separate facts attached to a wine-vintage record. They are not columns on `wine_vintages`, and they are not attached to wineries.

A critic review records the source's expressed rating rather than forcing every review into a single scoring scale. It must support numeric scores, stars, medals, and recommendation language. A later normalized value can be derived for sorting or display, but it is not the canonical review fact.

Review sources are controlled identities. Broadly recognised sources can be shared across the catalogue; user-defined sources belong to the site that created them unless deliberately promoted later. Review rows should reference a review source rather than storing arbitrary source text.

Critic reviews need provenance. A source URL is optional because some valid reviews come from physical guides, subscription databases, or user-provided context in a chat session. Full copied critic prose should not be stored by default; score facts, attribution, source URL, and user-authored notes are enough.

## Product Behaviour

The web UI should edit critic reviews on the wine-vintage detail or edit surface. Bottle cards, search results, and inventory views can show compact summaries when critic reviews exist.

MCP should expose a separate critic-review surface rather than folding reviews into a broad wine-edit tool. The likely tool set is:

```text
cellar.list_review_sources
cellar.create_review_source
cellar.list_critic_reviews
cellar.upsert_critic_review
cellar.delete_critic_review
```

All site editors can create, edit, and delete critic reviews for wines in that site. The initial author is provenance, not an ownership boundary.

Critic reviews are enrichment metadata. They can inform later evaluation or ranking, but they do not determine date-based drink status. `drink-now`, `drink-soon`, `hold`, and `past-window` remain drink-window classifications.

## Automation

Do not specify automated enrichment yet. There is no agreed reliable data source for recognised critic scores, and scraping critic sites is out of scope. The expected near-term workflow is ad-hoc enrichment via chat using authenticated MCP write tools.

If automated enrichment is revisited later, it should be asynchronous and must not block bottle or wine ingestion.

## Implementation Shape

Expected database concepts:

```text
review_sources
critic_reviews
```

`critic_reviews` should reference `wine_vintages` and `review_sources`, preserve site access boundaries, and include creation/update timestamps plus provenance fields. Hard-deleting a review source while reviews reference it should not be allowed; support rename, deactivate, or merge instead.

The MCP implementation should follow the existing `z/implement` pattern:

1. use compact MCP IDs where exposed;
2. enforce authenticated site membership before reads and writes;
3. keep write tools narrow and domain-specific;
4. persist MCP audit events for writes;
5. return structured JSON with affected records.

## Open Implementation Decisions

The exact schema field names and MCP schemas still need code-backed design. In particular, decide how to represent mixed numeric and non-numeric expressed scores without losing source fidelity.
