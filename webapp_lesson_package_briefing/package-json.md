# Enriched Package JSON — `{code}_package.json`

Single self-contained JSON file per subtopic that carries all data needed to render the three output products (board, handout, lesson plan) in any frontend. Designed as the data contract between the content pipeline (this repo) and the webapp (Next.js/Supabase/Vercel).

## Location

```
data/{subject}/slides/{code}_package.json
```

Example: `data/030-meteorology/slides/30_1_1_package.json`

## When to generate

After all three products (board HTML, handout HTML, lesson plan JSON) are finalised and pass `qa_package.py --semantic`. The package JSON is the **export format** — the last step before handing off to the webapp.

## Top-level structure

| Key | Type | Purpose |
|-----|------|---------|
| `topic` | string | Subtopic code, e.g. `"30.1.1"` |
| `title` | string | Short title, e.g. `"The Atmosphere"` |
| `subtitle` | string | Descriptive subtitle |
| `subject` | object | `{ code, name }` |
| `los` | array | LOs covered: `{ code, short, text }` |
| `duration_minutes` | number | Total lesson duration |
| `question_count` | number | ECQB questions for this topic |
| `images` | object | Image registry (see below) |
| `data` | object | Structured data tables (see below) |
| `sections` | array | Content sections (see below) |
| `bookends` | object | Opening/closing items |
| `handout` | object | Handout-specific: takeaways, definitions, exam tips, page layout |
| `flow` | array | Teaching phases with timing, key points, Socratic Qs |
| `pedagogy` | object | Tier definitions, assumptions, preparation |
| `exam` | object | Question IDs (instructor-only) |
| `sources` | object | Source attributions |
| `versioning` | object | Version tracking (see below) |

## Images

Images are referenced by **semantic key**, mapped to a file ID that the webapp fetches from a Supabase storage bucket. No image data is embedded — no duplication.

```json
"images": {
  "composition_pie": {
    "id": "met_01_s004_01.jpg",
    "alt": "Atmospheric composition pie chart",
    "caption": "Composition of dry air by volume",
    "source": "ATPL Presentations — Meteorology Lesson 1"
  }
}
```

- `id` — filename in Supabase bucket (stable, unique across the system)
- `alt` — accessibility text
- `caption` — display caption below image
- `source` — attribution

Sections and handout pages reference images by semantic key (e.g. `"composition_pie"`), not by file path.

## Structured data

The `data` object holds typed, structured data that the webapp renders as cards, tables, or visualisations. Not embedded in text — kept separate for flexible rendering.

| Key | Content |
|-----|---------|
| `gas_composition` | Array of `{ gas, formula, percentage, highlight, minor, note }` |
| `atmospheric_layers` | Array of `{ layer, extent, temperature_trend, primary }` |
| `isa_values` | Nested object: `sea_level` (temp, pressure, density), `lapse_rate`, `tropopause_temperature/height` |
| `tropopause_heights` | Array of `{ location, height_km, height_ft }` |
| `relationships` | Array of `{ increase, decrease, note }` |

These keys are topic-specific — other topics will have different data tables.

## Sections

Each section represents a content block that appears on both the board and handout (in different forms).

```json
{
  "id": "composition",
  "title": "Gas Composition & Water Vapour",
  "los": ["30.1.1.1.1", "30.1.1.2.1"],
  "images": ["composition_pie"],
  "data_refs": ["gas_composition"],
  "content": ["paragraph 1...", "paragraph 2..."],
  "must_know": ["bullet 1...", "bullet 2..."],
  "insights": ["insight 1...", "insight 2..."]
}
```

- `id` — stable identifier, referenced by flow phases and handout pages
- `los` — full LO codes this section covers
- `images` — semantic keys from the `images` registry
- `data_refs` — keys from the `data` object to render as cards/tables
- `content` — text paragraphs (uses `**bold**` markdown)
- `must_know` — condensed must-know bullets (handout callouts)
- `insights` — board insight callouts (blue-border cards)

## Flow (teaching phases)

Each phase in the `flow` array represents a teaching segment. Phases link to sections via the `section` field.

```json
{
  "phase": "Gas Composition",
  "lo": "30.1.1.1.1",
  "duration_minutes": 3,
  "section": "composition",
  "instruction": "...",
  "key_points": [{ "text": "...", "tier": "must_know" }],
  "socratic_questions": [{ "text": "...", "tier": "must_know", "note": "..." }],
  "common_misconceptions": ["..."],
  "exam_link": "...",
  "board_focus": "..."
}
```

- Opening and Conclusion phases have `"section": null`
- Opening has `socratic_questions`, Conclusion has `summary` and `exam_reminder`

## Handout

Handout-specific rendering data.

```json
"handout": {
  "takeaways": ["..."],
  "definitions": [{ "term": "ISA", "definition": "International Standard Atmosphere" }],
  "exam_tips": ["..."],
  "pages": [
    {
      "page": 1,
      "title": "The Atmosphere",
      "subtitle": "30.1.1 — Composition, extent & vertical division",
      "sections": ["composition", "relationships"],
      "show_header": true,
      "show_takeaways": true
    }
  ]
}
```

- `pages` array defines page layout: which sections appear on each page, plus flags for header/takeaways/definitions/exam_tips
- Each page renders as A4 landscape with a 66/34 content/notes column split

## Bookends

Opening and closing cards for the board view.

```json
"bookends": {
  "opening": {
    "label": "In this lesson you will learn",
    "items": ["..."]
  },
  "closing": {
    "label": "In this lesson you learned",
    "items": ["..."],
    "footer": "..."
  }
}
```

## Versioning

```json
"versioning": {
  "version": "1.0",
  "created_at": "2026-03-16T18:00:00Z",
  "updated_at": "2026-03-16T18:00:00Z",
  "changelog": "Initial enriched package.",
  "previous_version": null
}
```

- `version` — semver string, bumped on each re-export
- `created_at` / `updated_at` — ISO 8601 timestamps
- `changelog` — what changed in this version
- `previous_version` — version string of the prior export (null for first)

The webapp should soft-delete the old version and insert the new one on import. Use `version` + `updated_at` to track lineage.

## Text formatting

All text fields use lightweight markdown:
- `**bold**` for emphasis
- `→` for arrows
- `↔` for bidirectional
- `−` for minus
- Plain text otherwise

The webapp's rendering layer converts this to appropriate HTML/JSX.

## Webapp integration

The webapp (Next.js/TypeScript/Supabase/Vercel) consumes this JSON to render three views:

1. **Board view** — infinite canvas with sections, cards, data tables, images, insight callouts, bookends, pan/zoom/draw toolbar
2. **Handout view** — paginated A4 landscape, content/notes columns, must-know callouts, exam section, left/right-hand toggle
3. **Lesson plan view** — phase-by-phase instructor prep with timing, key points (colour-coded by tier), Socratic questions with instructor notes, misconceptions

The three reference HTML files (`30_1_1_board.html`, `30_1_1_handout.html`, `30_1_1_lesson_plan.html`) serve as the visual design spec.
