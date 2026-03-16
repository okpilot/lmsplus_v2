# EASA PPL Webapp — Lesson Package Rendering Briefing

## What is this?

This ZIP contains everything you need to build React components that render aviation lesson packages for an EASA PPL(A) study system. One JSON file drives three views: a whiteboard-style **board** (instructor presents), a print-ready **handout** (student take-home), and a **lesson plan** (instructor preparation).

The system teaches meteorology, air law, and other pilot exam subjects. The audience is PPL student pilots — beginners, often non-native English speakers. Every lesson covers a specific subtopic (e.g. "30.1.1 — The Atmosphere") and is built around Learning Objectives (LOs) from the EASA syllabus.

## Files included

| File | What it is |
|------|-----------|
| `30_1_1_package.json` | **The data.** Enriched, self-contained JSON for topic 30.1.1. This is the format every future topic will follow. |
| `30_1_1_board.html` | **Visual reference** for the Board view. Open in a browser to see the design. |
| `30_1_1_handout.html` | **Visual reference** for the Handout view. Open in a browser (or print to PDF) to see the design. |
| `30_1_1_lesson_plan.html` | **Visual reference** for the Lesson Plan view. Open in a browser to see the design. |
| `package-json.md` | **Schema reference.** Full documentation of every key in the package JSON. |
| `WEBAPP_BRIEFING.md` | This file. |

The HTML files are the **design spec** — your React components should produce the same visual result, rendered from the JSON data. You do NOT need to parse the HTML. It is just for visual reference.

---

## The three views

### 1. Board (instructor presents to class)

**Concept:** An infinite-canvas whiteboard. The instructor opens it in a browser, zooms/pans to each section during the lesson. Students see it projected.

**Key design features:**
- **Infinite canvas** with dot-grid background (`#F8F8F6`, dots at 32px spacing)
- **Pan/zoom** via mouse drag + scroll wheel (or pinch). Fit-to-screen on key `0`
- **Drawing toolbar** at bottom centre: hand tool, pen, highlighter, line, arrow, rectangle, ellipse, eraser. Colour picker (red, blue, green, black, orange, purple). Size picker (S/M/L). Undo, delete-all, zoom controls. All drawn annotations are SVG overlays.
- **Board title** at top: subject code, lesson title, subtitle, meta (LO count, question count, duration)
- **Opening bookend**: blue-left-accent card with "In this lesson you will learn" + bullet list. Icon: info circle.
- **Sections**: each has a `.section-title` with LO badges (`LO 1.1.1` format, blue pill), then content cards, data tables, images with captions, and insight callouts
- **Insight callouts**: blue-left-border cards with bold key takeaways. These are the Must Know facts the instructor emphasises.
- **Data cards**: ISA values (large monospace numbers), layer boundary tables, gas composition cards (percentage + label), relationship rows (↑ X → ↓ Y with note)
- **Images**: displayed inline with captions below
- **Closing bookend**: green-check-accent card with "In this lesson you learned" + bullet list + footer
- **Footer**: source attribution + topic/version code

**Colour palette:**
- `--accent: #2563EB` (blue — LO badges, insight borders, bookend accents)
- `--amber: #B45309` (amber — water vapour highlight card)
- `--text: #1A1A1A`, `--text-mid: #3A3A3A`, `--text-muted: #6B6B6B`
- `--border: #E5E5E0`
- Background: `#E8E8E4` (viewport), `#F8F8F6` (board with dot grid)

**Typography:**
- Headings: Space Grotesk (600/700)
- Body: Inter (400/500)
- Data/numbers: JetBrains Mono (600/700)

**JSON mapping for Board:**
- Title → `topic`, `title`, `subtitle`, `subject`
- Opening bookend → `bookends.opening`
- Sections → `sections[]` array — each section's `title`, `los`, `images`, `data_refs`, `insights`
- Data cards/tables → `data.*` (gas_composition, atmospheric_layers, isa_values, tropopause_heights, relationships)
- Images → `images.*` by semantic key, fetch from Supabase bucket by `id`
- Closing bookend → `bookends.closing`

---

### 2. Handout (student print-out)

**Concept:** A4 landscape pages, printed and given to students at the start of the lesson. They follow along and write notes in the ruled column. Taken home as revision material.

**Key design features:**
- **A4 landscape** (297mm × 210mm), hard-paginated — each `.page` div is exactly one printed page
- **Two-column layout**: content (66%) + notes (34%), separated by a vertical rule
- **Left/right-hand toggle**: a checkbox that swaps column order via CSS (`:checked` selector). The notes column goes to the side of the student's writing hand. Persists in print. Hidden toggle button in screen view (top-right corner, hand icon).
- **Page 1 header**: subject code, title, subtitle, LO count, question count, duration
- **Key Takeaways** box: blue accent, bullet list of the 5–6 most important facts
- **Content sections**: condensed text (shorter than board), images with captions, must-know callout boxes (blue-left-border, smaller)
- **Data panels**: ISA values grid, layer tables — same data as board but compact
- **Must-know callouts** (`.mk`): blue-left-border blocks with bold key facts. Denser than board insights.
- **Key Definitions** grid: term + definition pairs
- **Exam Focus** section: amber-accented tips with `!` prefix, bold keywords
- **Ruled notes column**: repeating horizontal lines (24px spacing) for handwriting
- **Page numbers**: bottom-right of each page (e.g. "1 / 3")
- **Footer**: source attribution on every page

**Typography:** Same families as board, but smaller — base 11px, sections 10px, captions 7.5px.

**Colour palette:** Same as board, plus `--amber: #92400E` (slightly darker for print), `--amber-bg: #FEF3C7`.

**JSON mapping for Handout:**
- Header → `topic`, `title`, `subtitle`, `subject`, `los` count, `question_count`, `duration_minutes`
- Takeaways → `handout.takeaways`
- Pages → `handout.pages[]` — each page lists which `sections` to render, plus flags (`show_header`, `show_takeaways`, `show_definitions`, `show_exam_tips`)
- Section content → `sections[].content` (text paragraphs), `sections[].must_know` (callout bullets)
- Data panels → `data.*` referenced by `sections[].data_refs`
- Images → `images.*` referenced by `sections[].images`
- Definitions → `handout.definitions`
- Exam tips → `handout.exam_tips`

---

### 3. Lesson Plan (instructor preparation)

**Concept:** The instructor reads this before the lesson to understand the flow, timing, key points, Socratic questions, common misconceptions, and exam links. Not shown to students.

**Key design features:**
- **Phase-by-phase layout**: each teaching phase is a card with duration badge, LO link, and section reference
- **Tiered key points**: Must Know (blue), Good to Know (grey/green), Fun to Know (amber/light) — colour-coded badges
- **Socratic questions**: displayed with tier badge + instructor note (italic, what to expect from students)
- **Common misconceptions**: warning-style callouts
- **Exam links**: what ECQB questions test this, common distractors
- **Board focus**: hint text telling the instructor where to zoom on the board
- **Opening phase**: shows the opening hook question
- **Conclusion phase**: summary bullets + exam reminder text
- **Cross-references**: links to related topics (optional, shown as suggestions)
- **Preparation notes**: what to do before the lesson starts
- **ECQB question IDs**: listed for instructor reference (NEVER shown to students)

**JSON mapping for Lesson Plan:**
- Flow → `flow[]` array — each phase has `phase`, `lo`, `duration_minutes`, `section`, `instruction`, `key_points`, `socratic_questions`, `common_misconceptions`, `exam_link`, `board_focus`
- Key points → `flow[].key_points[]` with `text` and `tier`
- Socratic Qs → `flow[].socratic_questions[]` with `text`, `tier`, `note`
- Conclusion → last flow phase with `summary[]` and `exam_reminder`
- Pedagogy → `pedagogy` (tier definitions, assumptions, preparation)
- Exam IDs → `exam.question_ids` (instructor-only — MUST NOT appear in board or handout)

---

## Images

Images are stored in a **Supabase storage bucket**. The package JSON references them by semantic key:

```json
"images": {
  "composition_pie": {
    "id": "met_01_s004_01.jpg",    // ← filename in Supabase bucket
    "alt": "Atmospheric composition pie chart",
    "caption": "Composition of dry air by volume"
  }
}
```

Sections reference images by key: `"images": ["composition_pie"]`. The webapp resolves the key → fetches from Supabase by `id`.

**Never duplicate images.** The same image ID can appear across multiple topics. The bucket is the single source.

---

## Structured data

The `data` object contains typed data that should be rendered as cards, tables, or visualisations — NOT as raw text. Examples:

**Gas composition** → render as cards with large percentage + gas name (like the board's gas cards):
```json
{ "gas": "Nitrogen", "formula": "N₂", "percentage": 78 }
```

**ISA values** → render as a grid of large monospace values with labels:
```json
{ "sea_level": { "temperature": { "value": 15, "unit": "°C" } } }
```

**Relationships** → render as arrow rows: ↑ Altitude → ↓ Pressure:
```json
{ "increase": "Altitude", "decrease": "Pressure", "note": "Halves every ~18,000 ft" }
```

Each section's `data_refs` array tells you which data keys to render in that section.

---

## Versioning & soft delete

Each package JSON includes:

```json
"versioning": {
  "version": "1.0",
  "created_at": "2026-03-16T18:00:00Z",
  "updated_at": "2026-03-16T18:00:00Z",
  "changelog": "Initial enriched package.",
  "previous_version": null
}
```

When a new version is imported:
1. Soft-delete the existing record for this topic (mark as `deleted_at = now()`)
2. Insert the new version
3. Use `version` + `updated_at` for display and audit trail

---

## Text formatting

All text fields use lightweight markdown:
- `**bold**` for emphasis (render as `<strong>`)
- `→` for arrows
- `↔` for bidirectional arrows
- `−` for minus signs
- Everything else is plain text

---

## What to build

Three React components (or pages/routes), all driven by the same `package.json` data:

1. **`<Board />`** — infinite canvas with pan/zoom/draw, sections, insight callouts, bookends, data cards, images. The instructor projects this.
2. **`<Handout />`** — paginated A4 landscape view with content/notes columns, must-know callouts, definitions, exam tips. Printable. Left/right-hand toggle.
3. **`<LessonPlan />`** — phase-by-phase instructor view with tiered key points, Socratic questions, misconceptions, timing.

Plus shared components:
- `<ImageFromBucket />` — fetches image by ID from Supabase storage
- `<DataCard />` / `<DataTable />` — renders structured data from `data.*`
- `<MarkdownText />` — converts `**bold**` to `<strong>`
- `<LOBadge />` — blue pill showing LO code
- `<TierBadge />` — coloured badge for must_know / good_to_know / fun_to_know

---

## Design principles

- **Light mode only.** No dark mode.
- **Clean, professional, calm.** This is an aviation training tool. Think: flight school, not startup.
- **Typography matters.** Space Grotesk for headings, Inter for body, JetBrains Mono for data values.
- **Blue accent (`#2563EB`)** for interactive elements, LO badges, insight borders.
- **Amber (`#B45309`)** for exam warnings and highlighted data (like water vapour).
- **Print-first for handout.** It must look perfect when printed on a real printer. Test with Ctrl+P.
- **Content is king.** The design serves the content, not the other way around. No decorative elements.
