# MyHero Document Extraction v3 — Technical Brief
---

## What It Does

MyHero Extraction v3 takes any PDF — contracts, standards, regulations, specs — and produces a single structured JSON that contains **every word, table, image, cross-reference, and defined term** in the document, organized into a navigable hierarchy.

The output JSON is the single source of truth. The app reads it and renders the document with full structure, navigation, and cross-referencing.

---

## Where We Are — Honest Assessment

### What's Working

We ran the pipeline against three real documents of increasing complexity:

| Document | Pages | Blocks Extracted | Segments Found | Cross-Refs | Time | Cost |
|---|---|---|---|---|---|---|
| Professional Services Agreement | 10 | 176 | 4 | 10 | ~3 min | $0.12 |
| FIDIC Yellow Book (Intl. Construction Contract) | 130 | 2,568 | 22 | 594 | ~6 min | $1.48 |
| Large Standards Document | 339 | ~6,000 | ~30 | ~1,200 | ~12 min | ~$3.80 |

Every word from the original document is preserved verbatim. Every table, image, and cross-reference is captured. The hierarchy (sections, sub-sections, clauses) is reconstructed with navigable dot-notation paths like `6.A.3.a`. Documents are automatically split into segments — main body, schedules, annexes, exhibits, signature pages — each with their own numbering conventions detected and applied.

For the 130-page FIDIC contract: 130 out of 130 pages extracted successfully. 21 out of 22 segments populated with content (the 22nd, signatures, was intentionally empty). 594 cross-references found and classified — 226 internal (resolved to specific sections), 90 external (legislation/other documents), 278 requiring further resolution.

### What's Honestly Weak

**Timeout on very large docs.** Mistral's API has a 300-second connection timeout. On a 339-page doc at 40 concurrent workers, 3-5% of pages may fail after retries. A 500-page contract missing 15-25 pages isn't acceptable for legal use. Fix: a retry-failed-pages mode that re-processes only timed-out pages at lower concurrency. Not built yet — roughly 1-2 days of work.

**No human-in-the-loop correction yet.** If the LLM assigns a block to the wrong section path, there's no UI to fix it and re-validate. Enterprise buyers will want the ability to spot-check and correct. This is an app-layer feature, not a pipeline issue.

**No gold-standard benchmark.** We haven't manually tagged a full document to compare extraction accuracy against ground truth. We know every word is captured (by design), and we know the hierarchy is mostly right (by inspection), but we can't say "97.3% of blocks are correctly classified" because we haven't measured that yet.

### TLDR on Cost and Time

The pipeline handles real enterprise documents — 10 pager to 300+ page international construction contracts with complex nested hierarchies, multiple numbering conventions, cross-references between sections, and dozens of annexes and schedules. At $0.01/page. In under 10 minutes.

The gaps (page retry, human correction, benchmark) are engineering work measured in days, not architectural problems. The core extraction — OCR, hierarchy detection, block classification, cross-referencing — is working.

---

## Comparision of options

Most document extraction approaches fall into one of these categories:

| Approach | How it works | Hierarchy | Cross-refs | Cost/page | Handles 300+ pgs |
|---|---|---|---|---|---|
| **Manual tagging** | Humans read and tag | ✅ Perfect | ✅ Perfect | $1-5/page | ⚠️ Weeks |
| **Basic PDF parsers** (PyPDF, PDFPlumber) | Text dump with coords | ❌ Lost | ❌ None | ~$0 | ✅ Fast |
| **GPT-4 full-doc** | Send entire doc to LLM | ⚠️ Inconsistent | ⚠️ Partial | $0.10-0.30/pg | ❌ Context limit |
| **Marker / Docling** | Open-source layout models | ⚠️ Flat sections | ❌ None | ~$0.01/pg | ✅ But flat |
| **MyHero v3** | Hybrid regex+LLM, parallel | ✅ Full hierarchy | ✅ Automatic | **$0.01/pg** | ✅ Tested to 339 |

**Key differentiators:**

**1. Zero information loss.** Every block carries the original OCR markdown verbatim. If the hierarchy is wrong, the content is still there. You can always re-parse, re-display, or fall back to raw text. No other LLM-based approach guarantees this.

**2. Cross-references extracted automatically.** 594 cross-references found in a 130-page contract — "Section 4.2", "pursuant to Clause 8", "see Exhibit A" — classified as internal, external, or ambiguous, with resolution to specific section paths. This is the kind of feature that makes legal teams say "wait, it does that?"

**3. Cost.** $0.01/page vs $0.10-0.30/page for GPT-4 approaches. A 500-page contract costs $5 instead of $50-150. This matters for volume processing.

**4. Handles document complexity.** 22 segments correctly identified in the FIDIC book — general conditions, appendices, annexes, schedules, dispute agreements, contract agreement, cover page, foreword, errata — each with their own numbering. Most tools treat the entire document as one flat blob.

**5. Structured and typed output.** Every block conforms to a Zod-enforced schema. Block types, section paths, indent levels, segment IDs — all typed and validated. No "sometimes it returns JSON, sometimes it doesn't" problems. The app gets predictable, queryable data every time.

---

## How It Works: 4 Passes

```
PDF → [Pass 0: OCR] → [Pass 1: Structure] → [Pass 2: Extract] → [Pass 3: Assemble] → JSON
       Mistral API      Regex + LLM            LLM (parallel)     Pure code ($0)
       ~$0.003/pg       ~$0.03 fixed            ~$0.008/pg         instant
```

### Pass 0 — OCR (Mistral OCR API)
Converts PDF pages to markdown. Tables become pipe-tables. Images get bounding boxes. This is the raw material everything else builds on.

### Pass 1 — Structure Detection (Regex + LLM, 2-4 calls)
Three sub-steps that give us the document's blueprint:

**1a. Regex Prescan** — Scans every page ($0, <0.02 seconds). Counts patterns like "1.", "2.", "(a)", "(b)" across the entire document. Detects tables, images, segment boundaries (exhibits, schedules, annexes), and convention breaks. This gives us ground truth numbers the LLM can't hallucinate away from.

**1b. LLM Convention Detection** — Sends a smart sample of pages (up to 25-30) to the LLM. For large docs, this is split into parallel chunks of 10 pages each to avoid API timeouts. The LLM builds:
- **Numbering conventions**: How this specific document numbers things (Article I → Section 1.1 → (a)? Or 1 → 1.1 → 1.1.1?)
- **Segments**: Main body, schedules, exhibits, annexes, signature pages — with page ranges
- **Skeleton**: A table of contents with section paths, labels, titles, indent levels, and parent relationships
- **Metadata**: Parties, key dates, defined terms

**1c. LLM Verification** — Compares regex counts against LLM output. If regex found 7 segments but LLM says 17, the LLM is asked to reconcile. In our 130-page test, verification caught a segment count mismatch and corrected it — producing the final 22 segments.

**Why hybrid (regex + LLM)?** Regex gives exact counts the LLM can't dispute. LLM gives semantic understanding regex can't achieve. Together they're more accurate than either alone.

### Pass 2 — Block Extraction (LLM, parallel)
Every page is processed independently in parallel (up to 40 concurrent API calls). Each page produces an ordered list of "blocks" — the atomic content units. Each block carries:

- **content** — Verbatim text, never summarized
- **raw_markdown** — The exact OCR output for this block (formatting preserved)
- **section_path** — Where it lives in the hierarchy ("6.A.3.a")
- **block_type** — heading, paragraph, clause, table, ordered_list_item, etc.
- **indent_level** — Nesting depth (0-6)
- **segment_id** — Which segment it belongs to
- **Cross-page flags** — Whether it continues from/to adjacent pages

Each page gets injected context from Pass 1: what section was active on the previous page, what sections are expected on this page, and the numbering conventions. This prevents the classic problem of a page starting with "(b)" and the LLM not knowing it belongs under Section 6.A.

### Pass 3 — Assemble & Validate (pure code, $0)
No LLM calls. Instant. Does four things:
1. **Stitches** cross-page blocks (sentences split across pages get rejoined)
2. **Enriches** tables with structured data (headers, rows, cells)
3. **Extracts cross-references** — finds every "Section 4.2", "pursuant to Clause 8", "see Exhibit A" and classifies them
4. **Validates** — checks for structural issues (duplicate headings, orphan paths, missing sections, indent jumps)

---

## Code vs LLM/OCR Split

A key design principle: **maximize deterministic code, minimize LLM dependence**. The LLM handles only what code fundamentally cannot — semantic understanding of document structure and content classification. Everything else is programmatic.

### By What Each Component Does

| Component | Type | What It Does |
|---|---|---|
| **Regex prescan** (Pass 1a) | 🟢 Pure code | Scans ALL pages. Counts every pattern, detects tables/images/segments, finds convention breaks |
| **Smart sampling** | 🟢 Pure code | Selects which pages to send to LLM — prioritizes segment boundaries, convention breaks, first/last pages |
| **Convention context builder** | 🟢 Pure code | Translates regex findings into structured context injected into every LLM call |
| **Segment assignment** | 🟢 Pure code | Routes blocks to correct segment using narrowest page range match |
| **Cross-page stitching** | 🟢 Pure code | Rejoins sentences/paragraphs split across pages |
| **Orphan path correction** | 🟢 Pure code | Fixes section paths using skeleton as ground truth |
| **Missing skeleton repair** | 🟢 Pure code | Recovers sections lost to cross-page heading splits |
| **Table enrichment** | 🟢 Pure code | Parses markdown tables into structured headers/rows/cells |
| **Cross-reference extraction** | 🟢 Pure code | Finds and classifies all internal/external references via regex |
| **Validation & scoring** | 🟢 Pure code | Checks structural integrity, flags issues |
| **OCR** (Pass 0) | 🔵 API | Converts PDF to markdown |
| **Convention detection** (Pass 1b) | 🟡 LLM | Builds skeleton, segments, numbering conventions from sampled pages |
| **Verification** (Pass 1c) | 🟡 LLM | Cross-checks regex vs LLM, corrects discrepancies |
| **Block extraction** (Pass 2) | 🟡 LLM | Extracts content blocks per page with hierarchy context |

### By Lines of Code

| File | Lines | Role |
|---|---|---|
| `prescan.js` | 421 | 🟢 100% deterministic (regex, sampling, context building) |
| `schemas.js` | 242 | 🟢 100% deterministic (Zod type definitions, validation) |
| `extract.js` | 1,255 | 🟢 ~70% deterministic (stitching, enrichment, validation, orchestration) / 🟡 ~30% LLM call setup |
| `prompts.js` | 180 | 🟡 100% LLM prompt engineering |
| **Total** | **2,098** | **~75% deterministic code / ~25% LLM interaction** |

### By Processing Time (130-page FIDIC, latest run)

| Step | Time | % of Total | Type |
|---|---|---|---|
| Pass 0 — OCR | 9.1s | 2.4% | 🔵 API |
| Pass 1a — Regex prescan (all 130 pages) | 0.02s | 0.005% | 🟢 Code |
| Pass 1b — LLM convention (3 parallel chunks) | 86.0s | 22.3% | 🟡 LLM |
| Pass 1c — LLM verification | 36.6s | 9.5% | 🟡 LLM |
| Pass 2 — Block extraction (40 parallel workers) | 253.6s | 65.8% | 🟡 LLM |
| Pass 3 — Stitch + enrich + validate | 0.06s | 0.015% | 🟢 Code |
| **Total** | **385.5s** | | |

**The takeaway**: Deterministic code does 75% of the logic but executes in **0.08 seconds**. The LLM does 25% of the logic but consumes **376 seconds** waiting on API responses. If Mistral's API were 2x faster tomorrow, the pipeline would be 2x faster with zero code changes.

### By Cost (130-page FIDIC)

| Component | Cost | % of Total |
|---|---|---|
| 🔵 OCR (Mistral OCR) | $0.39 | 26.4% |
| 🟡 LLM — Pass 1 (structure, 4 calls) | $0.033 | 2.2% |
| 🟡 LLM — Pass 2 (extraction, 130 calls) | $1.053 | 71.3% |
| 🟢 All deterministic code | $0.00 | 0% |
| **Total** | **$1.48** | **$0.0114/page** |

---

## The Output JSON

```
{
  metadata          — Processing stats, cost, quality score
  document_info     — Title, type, parties, dates, conventions, skeleton, definitions
  segments[]        — Each segment contains:
    ├── blocks[]    — The content blocks (with raw_markdown preserved)
    ├── tables[]    — Structured table data
    ├── cross_references[]  — Internal/external references
    └── definitions[]       — Defined terms with usage locations
  raw_pages[]       — Original OCR markdown per page (insurance policy)
}
```

### The Block — Core Content Unit

Every piece of content in the document becomes a block:

| Field | What it is | Example |
|---|---|---|
| `block_id` | Unique identifier | `b142` |
| `block_type` | Content classification | `heading`, `paragraph`, `clause`, `ordered_list_item`, `table` |
| `content` | Verbatim text | `"The Contractor shall maintain insurance..."` |
| `raw_markdown` | OCR output preserved | `"**6.A.** The Contractor shall..."` |
| `section_path` | Hierarchy position (dot-notation) | `6.A.3.a` |
| `sequence_label` | Label as written | `(a)`, `6.A.`, `Article 1` |
| `parent_section_path` | Parent in hierarchy | `6.A.3` |
| `indent_level` | Nesting depth | `3` |
| `segment_id` | Which segment | `general_conditions`, `exhibit_a` |
| `has_table` / `has_image` | Embedded content flags | `true` / `false` |

### Cross-References

Every internal reference ("see Section 4.2") is detected and resolved:

| Field | Example |
|---|---|
| `reference_text` | `"Section 4.2"` |
| `target_type` | `internal_section`, `external_legislation`, `ambiguous` |
| `resolved_section_path` | `4.2` (if internal and found in skeleton) |
| `external_document_name` | `"Arbitration Act"` (if external) |
| `confidence` | `0.95` (internal resolved) / `0.60` (ambiguous) |
| `context_sentence` | The sentence containing the reference |

### Segments

Documents are split into logical parts. The 130-page FIDIC contract produced 22 segments:

| Segment Type | Examples from FIDIC test |
|---|---|
| `main_body` | `seg_general_conditions` (1,786 blocks) |
| `appendix` | `appendix_1` (356 blocks), `appendix_g` (26 blocks) |
| `annex` | `annex_p`, `annex_a`, `annex_b`, `annex_c`, `annex_d`, `annex_e`, `annex_f` |
| `schedule` | `schedule_o_1` (54 blocks), `schedule_o_2` (16 blocks) |
| `cover_page` | `seg_cover` (8 blocks) |
| `preamble` | `seg_foreword` (40 blocks), `seg_errata` (18 blocks) |
| Other | `contract_agreement`, `dispute_adjudication_agreement_1p`, `dispute_adjudication_agreement_3p` |

Each segment can have its own numbering convention (e.g., Appendix G restarts numbering at 1).

---

## Speed & Cost

### Per-Page Speed Gets Faster at Scale

Per-page processing time **drops significantly** as documents get larger. Pass 0 (OCR) and Pass 1 (structure detection) have roughly fixed costs that get amortized across more pages, while Pass 2 (block extraction) parallelizes across 40 workers.

| Document | Pages | Total Time | Per Page | Why |
|---|---|---|---|---|
| 10-page agreement | 10 | ~3 min | **16.5s/pg** | Pass 1 dominates — structure detection costs the same for 10 pages as for 130 |
| 130-page FIDIC | 130 | ~6 min | **3.0s/pg** | Pass 1 fixed cost amortized; Pass 2 runs 40 pages in parallel |
| 339-page standards | 339 | ~12 min | **~2.2s/pg** | Same Pass 1 cost; Pass 2 parallelism fully utilized |

### Speed Variance Between Runs

Processing time varies between runs of the **same document** because ~98% of wall-clock time is spent waiting for Mistral API responses, and API latency fluctuates with server load.

| Document | Fastest Run | Slowest Run | Variance |
|---|---|---|---|
| 10-page agreement | 152s | 213s | ±28% |
| 130-page FIDIC | 386s | 682s | ±43% |

**Why it varies**: Mistral's API response times fluctuate with server load. The same call can take 10s or 60s. Pass 2 runs pages in parallel batches — each batch waits for its slowest page. If a few pages in a batch take 90s instead of 10s, total time jumps.

**For the app**: Show estimated time ranges ("~6-12 minutes for a 130-page doc") rather than exact predictions.

### Scaling Estimates

| Doc Size | Est. Time Range | Est. Cost | Per Page | Page Failure Risk |
|---|---|---|---|---|
| 1-20 pages | 2-4 min | $0.10-0.25 | ~$0.012 | None |
| 20-100 pages | 3-8 min | $0.25-1.00 | ~$0.010 | <1% |
| 100-300 pages | 6-15 min | $1.00-3.50 | ~$0.011 | 1-3% |
| 300-500 pages | 12-25 min | $3.50-6.00 | ~$0.010 | 3-5% |
| 500-1000 pages | 25-45 min | $6.00-12.00 | ~$0.010 | 5-8% |

---

## Quality Metrics

We report several quality signals for each extraction. The most important ones:

### What Actually Matters

| Metric | What it measures | 10-pg test | 130-pg test | Target |
|---|---|---|---|---|
| **Pages extracted** | Did every page produce blocks? | 10/10 (100%) | 130/130 (100%) | >99% |
| **Segments populated** | Are blocks in the right segments? | 4/4 (100%) | 21/22 (95%) | >90% |
| **Content preservation** | Is every word from the original present? | 100% | 100% | 100% (by design) |
| **Cross-references found** | Internal/external links detected | 10 | 594 | n/a |
| **Block type distribution** | Reasonable mix of headings, paragraphs, clauses | ✅ Sensible | ✅ Sensible | n/a |

### Structure Verification Score

We also compute a "structure verified" percentage that checks hierarchy consistency — duplicate headings, orphan section paths, missing skeleton entries, indent jumps. This score is useful for small documents where we can verify everything, but becomes less meaningful for large documents:

| Doc Size | Verified Score | Why |
|---|---|---|
| 10 pages | **100%** | Skeleton covers every section in the document — full verification possible |
| 130 pages | **89%** | Skeleton covers ~23% of pages. 11% unverified = paths on unsampled pages that can't be checked |
| 339 pages | **65%** | Skeleton covers ~8% of pages. 35% unverified = limitation of sampling, not extraction errors |

**This score measures verification coverage, not extraction accuracy.** A 65% on a 339-page doc means "we could only verify 65% of the structural hierarchy" — not "35% of the content is wrong." The content is all there; the hierarchy on unsampled pages just can't be checked against a skeleton that didn't include those pages.

For enterprise, block coverage and segment assignment are more meaningful quality indicators than the verification score.

---

## Architecture Decisions & Tradeoffs

### Why Hybrid (Regex + LLM) Instead of Pure LLM?

| Approach | Pros | Cons |
|---|---|---|
| **Pure LLM** | Simpler code | No verification anchor; 300+ page docs won't fit in context; expensive; no deterministic quality check |
| **Pure Regex** | Fast, deterministic, $0 | Can't understand semantics ("this A. is under Section 6, not standalone") |
| **Hybrid (our approach)** | Regex gives ground truth, LLM gives semantics, verification catches errors | More code complexity |

In the 130-page FIDIC test: regex found 7 segments and 4 hierarchy levels. The LLM found 17 segments. Verification caught the discrepancy and reconciled them into 22 final segments. Without the regex anchor, we'd never know the LLM missed 5 segments.

### Why Per-Page Parallel Extraction?

Sending the entire document to an LLM in one call doesn't work for docs over ~50 pages (context window limits, timeout risks). Instead, each page is extracted independently with hierarchy context injected from Pass 1.

**Benefits**: Up to 40x parallelism, predictable cost per page, one slow page doesn't block others, same architecture works for 5 pages or 5,000 pages.

**Risk**: Cross-page context loss — mitigated by injecting the full hierarchy chain from the previous page and expected sections from the skeleton into each page's prompt.

### Why Mistral?

| Factor | Mistral | OpenAI | Anthropic |
|---|---|---|---|
| OCR API | ✅ Built-in | ❌ None | ❌ None |
| Structured output (Zod) | ✅ Native | ✅ Native | ⚠️ Via tool_use |
| Cost per 1M input tokens | $0.50 | $3-15 | $3-15 |
| Response reliability | ⚠️ 300s timeout | ✅ More stable | ✅ More stable |

Mistral's key advantage: OCR and LLM from one vendor at 1/6th to 1/30th the cost. The architecture is LLM-agnostic — swapping providers requires changing only the API client, not the pipeline.

---

## Summary

| Metric | Value |
|---|---|
| **Cost** | ~$0.011/page |
| **Speed** | 2-25 min depending on doc size |
| **Speed per page** | 16s/pg (small docs) → 2-3s/pg (large docs) — gets faster at scale |
| **Speed variance** | ±30-45% between runs (Mistral API latency) |
| **Content preservation** | 100% — every word, table, image preserved verbatim |
| **Code vs LLM** | 75% deterministic code / 25% LLM (by logic) |
| **Code vs LLM** | 0.08s code / 376s API waiting (by time) |
| **Code vs LLM** | $0.00 code / $1.48 API (by cost) |
| **Pages extracted** | 100% success rate up to 130 pages |
| **Cross-references** | 594 found automatically in 130-page doc |
| **Parallelism** | Up to 40 concurrent API calls |
| **Architecture** | Same code path from 1 page to 1,000+ pages |
| **To production** | ~5 days of engineering for must-haves |