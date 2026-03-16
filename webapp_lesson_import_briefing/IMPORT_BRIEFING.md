# Webapp Lesson Import — Technical Briefing

## Decision: HTML as content, JSON as metadata sidecar

After evaluating approaches, we chose **Option A**: HTML/CSS files carry the visual content, a lean JSON sidecar carries only the structured metadata the webapp needs for features.

**Why:** The instructor designs lesson materials with full visual control in HTML/CSS. The webapp should render them exactly as designed — not re-interpret structured data through React components. The interactive features (drawing overlay, QR codes, attendance, toolbar) are app-layer concerns, layered on top of the content.

---

## What gets imported per lesson

Each learning objective (e.g. `30.1.1`) produces **four files**:

| File | Purpose | Stored in |
|------|---------|-----------|
| `{code}_board.html` | Board view — infinite canvas content the instructor presents | Supabase Storage (bucket: `lesson-content`) |
| `{code}_handout.html` | Student handout — A4 landscape, printable, with notes column | Supabase Storage (bucket: `lesson-content`) |
| `{code}_lesson_plan.html` | Instructor lesson plan — phase-by-phase prep (never shown to students) | Supabase Storage (bucket: `lesson-content`) |
| `{code}_meta.json` | Metadata sidecar — LOs, timing, exam IDs, image registry | Database (`lesson_packages` table as JSONB) |

### Example file names
```
30_1_1_board.html
30_1_1_handout.html
30_1_1_lesson_plan.html
30_1_1_meta.json
```

---

## The JSON metadata sidecar

The JSON does NOT drive rendering. It provides structured data that the webapp needs for:
- Lesson preparation form (LO list, duration, question count)
- Instructor Tools window (flow phases with timing, LO checklist)
- Exercise configuration (question IDs)
- Admin syllabus tree (topic code, title, subject)
- Versioning and audit trail

### Schema

```json
{
  "topic": "30.1.1",
  "title": "The Atmosphere",
  "subtitle": "Composition, extent & vertical division",
  "subject": {
    "code": "030",
    "name": "Meteorology"
  },

  "los": [
    { "code": "30.1.1.1.1", "short": "1.1.1", "text": "List the composition of gases in dry air" },
    { "code": "30.1.1.1.2", "short": "1.1.2", "text": "List the different layers of the atmosphere" }
  ],

  "duration_minutes": 25,
  "question_count": 12,

  "images": {
    "composition_pie": {
      "id": "met_01_s004_01.jpg",
      "alt": "Atmospheric composition pie chart",
      "caption": "Composition of dry air by volume"
    }
  },

  "flow": [
    {
      "phase": "Opening",
      "duration_minutes": 2,
      "section": null,
      "lo": null
    },
    {
      "phase": "Gas Composition",
      "duration_minutes": 3,
      "section": "composition",
      "lo": "30.1.1.1.1"
    },
    {
      "phase": "Conclusion",
      "duration_minutes": 1,
      "section": null,
      "lo": null
    }
  ],

  "exam": {
    "question_count": 12,
    "question_ids": ["MET-Q004", "QDB-688863", "ECQB-IMG_7121"]
  },

  "sources": {
    "primary": ["Pooleys APM Vol 2 Meteorology"],
    "images": "ATPL Presentations (Meteorology Lesson 1)"
  },

  "versioning": {
    "version": "1.0",
    "created_at": "2026-03-16T18:00:00Z",
    "updated_at": "2026-03-16T18:00:00Z",
    "changelog": "Initial import.",
    "previous_version": null
  }
}
```

### What was removed from the original package JSON

The following fields are NO LONGER in the JSON — they are now in the HTML files:

| Removed from JSON | Now lives in |
|---|---|
| `sections[]` (content, must_know, insights) | Board HTML + Handout HTML |
| `data.*` (gas_composition, isa_values, etc.) | Board HTML + Handout HTML (rendered visually) |
| `bookends` (opening/closing) | Board HTML |
| `handout.*` (takeaways, definitions, exam_tips, pages) | Handout HTML |
| `flow[].key_points`, `flow[].socratic_questions`, `flow[].common_misconceptions`, `flow[].exam_link`, `flow[].board_focus`, `flow[].instruction` | Lesson Plan HTML |
| `pedagogy` | Lesson Plan HTML |

The JSON `flow[]` array retains only the **phase names, durations, section IDs, and LO codes** — just enough for the Instructor Tools checklist and timing display.

---

## How the webapp renders each view

### Board

The webapp renders the board HTML inside a **controlled container** with interactive features layered on top:

```
┌─────────────────────────────────────────────────┐
│ Top Bar (app layer)                              │
│ [lesson title] [LIVE] [section] [QR] [Tools]    │
├─────────────────────────────────────────────────┤
│                                                  │
│   ┌──────────────────────────────────────┐      │
│   │                                      │      │
│   │   Board HTML content                 │      │
│   │   (rendered from stored HTML)        │      │
│   │                                      │      │
│   │   ┌──────────────────────────────┐   │      │
│   │   │ SVG Drawing Overlay          │   │      │
│   │   │ (app layer — on top of HTML) │   │      │
│   │   └──────────────────────────────┘   │      │
│   │                                      │      │
│   └──────────────────────────────────────┘      │
│                                                  │
├─────────────────────────────────────────────────┤
│ Drawing Toolbar (app layer)                      │
│ [hand][pen][highlight][line][rect][circle][text] │
│ [colors] [S M L] [eraser] [zoom]                │
└─────────────────────────────────────────────────┘
```

**Implementation:**
1. Fetch board HTML from Supabase Storage
2. Render in an iframe or a sandboxed container (sanitized if using `dangerouslySetInnerHTML`)
3. The board HTML already includes its own CSS (inline `<style>` block), fonts, and layout
4. The app adds: top bar, drawing SVG overlay (absolute positioned on top), drawing toolbar, pan/zoom controls, QR overlay modal, Attendance QR / Exercise QR buttons
5. Pan/zoom operates on the container transform, not the HTML content itself
6. Drawing strokes are stored as SVG paths in a separate layer — persisted to DB on auto-save (every 30-60 seconds) and on lesson finish
7. Images referenced in the HTML use Supabase Storage URLs — the content pipeline should use absolute URLs to the bucket, or the webapp rewrites relative `src` attributes at render time

**What the board HTML does NOT contain (app handles these):**
- Drawing overlay / annotations
- Pan/zoom controls
- Top bar with lesson info
- Drawing toolbar
- QR code overlays
- Attendance / exercise buttons

### Handout

Rendered inside a **webapp container** — the same app shell (header, sidebar, breadcrumb) wraps the HTML content. The HTML itself is displayed in a scrollable view showing A4 pages as a stack of cards (like print preview).

```
┌─────────────────────────────────────────────────┐
│ App Header (LMS Plus)                            │
├───────┬─────────────────────────────────────────┤
│       │ Breadcrumb: Lessons / Planned / ...      │
│  Side │ Title: 30.1.1 — The Atmosphere           │
│  bar  │                                          │
│       │ [Left hand] [Right hand]  [Download PDF] │
│       │                                          │
│       │ ┌──────────────────────────────────────┐ │
│       │ │                                      │ │
│       │ │  Handout HTML — Page 1               │ │
│       │ │  (A4 landscape, self-contained CSS)  │ │
│       │ │                                      │ │
│       │ └──────────────────────────────────────┘ │
│       │                                          │
│       │ ┌──────────────────────────────────────┐ │
│       │ │                                      │ │
│       │ │  Handout HTML — Page 2               │ │
│       │ │                                      │ │
│       │ └──────────────────────────────────────┘ │
│       │                                          │
│       │ ┌──────────────────────────────────────┐ │
│       │ │  Handout HTML — Page 3               │ │
│       │ └──────────────────────────────────────┘ │
└───────┴─────────────────────────────────────────┘
```

**Key feature — left/right-hand toggle:**
The handout HTML contains a hidden checkbox (`#hand-switch`) that swaps the content/notes column order via CSS `:checked` selector. The webapp should:
1. Expose this as a visible toggle button in the app UI (outside the HTML container — e.g. "Left hand" / "Right hand" segmented control)
2. When the user clicks the toggle, programmatically check/uncheck the `#hand-switch` checkbox inside the HTML container
3. The CSS handles the rest — columns swap, borders move
4. This state should be persisted per user preference (localStorage or DB)

**On-screen display:**
- The container shows A4 pages as a vertical stack with subtle shadows/borders between pages
- Light gray background behind the pages (similar to Google Docs print preview)
- Pages are scrollable vertically
- The HTML's own CSS handles internal layout — the webapp just provides the container

**PDF export:**
- "Download PDF" button in the webapp UI (app layer, outside the HTML container)
- Server-side: use **Playwright** (already in the stack) to render the HTML to PDF
- Before generating, set the hand toggle to the user's preference
- Playwright `page.pdf()` with `format: 'A4'`, `landscape: true`, `printBackground: true`
- Return the PDF as a download
- The HTML's `@page` CSS ensures perfect pagination — each `.page` div = one printed page

```typescript
// Pseudocode for PDF generation (server-side)
async function generateHandoutPdf(htmlContent: string, leftHanded: boolean) {
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  await page.setContent(htmlContent)

  if (leftHanded) {
    await page.check('#hand-switch')
  }

  const pdf = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  })

  await browser.close()
  return pdf
}
```

### Lesson Plan

Same container approach as handout — rendered inside the app shell with A4 pages displayed as scrollable cards.

```
┌─────────────────────────────────────────────────┐
│ App Header (LMS Plus)              [ADMIN badge] │
├───────┬─────────────────────────────────────────┤
│       │ Breadcrumb: Lessons / Planned / ...      │
│  Side │ Title: 30.1.1 — Lesson Plan              │
│  bar  │                                          │
│       │ [Download PDF]                           │
│       │                                          │
│       │ ┌──────────────────────────────────────┐ │
│       │ │                                      │ │
│       │ │  Lesson Plan HTML — Page 1           │ │
│       │ │  (A4 landscape, self-contained CSS)  │ │
│       │ │                                      │ │
│       │ └──────────────────────────────────────┘ │
│       │                                          │
│       │ ┌──────────────────────────────────────┐ │
│       │ │  Lesson Plan HTML — Page 2           │ │
│       │ └──────────────────────────────────────┘ │
└───────┴─────────────────────────────────────────┘
```

**Access control:** Lesson plan is **instructor-only**. The webapp must never serve this HTML to student roles. Enforce via:
- RLS on the storage bucket (or use a separate bucket)
- Server-side access check before serving the file
- The lesson plan HTML contains ECQB question IDs and teaching strategies — confidential

**PDF export:** Same Playwright approach as handout. Instructors can download their lesson plan as PDF to use offline.

### Container rendering pattern (shared by all three views)

All three HTML files (board, handout, lesson plan) follow the same pattern:

1. **HTML is self-contained** — includes its own `<style>` block, Google Fonts imports, and complete CSS
2. **Webapp provides the chrome** — header, sidebar, breadcrumb, action buttons (PDF, toggle, QR, etc.)
3. **HTML is rendered inside a container** — either iframe (full isolation) or a scoped `<div>` with `dangerouslySetInnerHTML` (simpler but needs CSS scoping to avoid style leaks)
4. **Interactive features are app-layer** — drawing overlay, QR buttons, hand toggle button, PDF export button are all outside the HTML content

**Recommended: iframe approach.** Each HTML file is loaded into an iframe. This gives:
- Full CSS isolation (HTML styles can't leak into the app)
- The HTML works exactly as designed (fonts, `@page`, etc.)
- Easy to communicate with via `postMessage` (for hand toggle, etc.)
- Security sandboxing built-in

---

## Images

Images in the HTML use references to a Supabase Storage bucket. Two approaches:

### Option 1: Absolute URLs (recommended)
The content pipeline writes absolute Supabase Storage URLs into the HTML:
```html
<img src="https://uepvblipahxizozxvwjn.supabase.co/storage/v1/object/public/lesson-images/met_01_s004_01.jpg" alt="...">
```
**Pros:** HTML works standalone. No webapp processing needed.
**Cons:** URLs break if bucket/project changes.

### Option 2: Placeholder URLs, rewritten at render time
The HTML uses placeholder paths:
```html
<img src="{{bucket}}/met_01_s004_01.jpg" alt="...">
```
The webapp replaces `{{bucket}}` with the actual Supabase Storage URL at render time.
**Pros:** Portable. Survives project changes.
**Cons:** Extra processing step.

**Recommendation:** Option 1 for now (simpler). If we migrate Supabase projects later, a find-replace on stored HTML is trivial.

---

## Storage & database schema

### Supabase Storage buckets
- `lesson-content` — HTML files (board, handout, lesson plan). Private bucket for lesson plan, public for handout/board.
- `lesson-images` — Images referenced by HTML. Public bucket.
- `lesson-drawings` — SVG annotation layers per lesson session. Private bucket.

### Database table: `lesson_packages`

```sql
CREATE TABLE lesson_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,                    -- "30.1.1"
  title TEXT NOT NULL,                    -- "The Atmosphere"
  subtitle TEXT,
  subject_code TEXT NOT NULL,             -- "030"
  subject_name TEXT NOT NULL,             -- "Meteorology"
  duration_minutes INTEGER NOT NULL,
  question_count INTEGER DEFAULT 0,
  meta JSONB NOT NULL,                    -- full sidecar JSON
  board_html_path TEXT NOT NULL,          -- path in lesson-content bucket
  handout_html_path TEXT NOT NULL,
  lesson_plan_html_path TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ                  -- soft delete
);
```

Key columns are denormalized for queries (topic, title, subject_code, duration). The full sidecar JSON lives in `meta` for anything the app needs (LOs, flow, exam IDs, images registry, sources).

---

## Import workflow

### Admin imports a lesson package

1. Admin navigates to Syllabus Manager → selects a learning objective → clicks "Import Package"
2. Admin uploads 4 files: `*_board.html`, `*_handout.html`, `*_lesson_plan.html`, `*_meta.json`
   - OR uploads a single ZIP containing all 4 files
3. Webapp validates:
   - JSON schema matches expected structure
   - `topic` in JSON matches the selected LO
   - All 3 HTML files are present
   - HTML is sanitized (strip `<script>` tags, event handlers — keep `<style>`, `<img>`, structural HTML)
4. Webapp uploads HTML files to `lesson-content` bucket
5. Webapp soft-deletes any existing `lesson_packages` row for this topic (sets `deleted_at`)
6. Webapp inserts new row with paths + meta JSON
7. Admin sees success confirmation with version info

### Versioning

- Each import creates a new record, soft-deleting the old one
- `version` field from the JSON sidecar tracks content versions
- `updated_at` is set on import
- Previous versions are queryable (filter `deleted_at IS NOT NULL`) for audit trail

---

## What the webapp does NOT do

- **Does NOT parse or interpret the HTML content.** It renders it as-is.
- **Does NOT extract text from HTML for search.** If full-text search across lessons is needed later, add a `search_text` column populated during import by stripping HTML tags.
- **Does NOT modify the HTML at render time** (except optionally rewriting image URLs if using placeholder approach).
- **Does NOT re-create the HTML from JSON.** The JSON is for app features, the HTML is for visual content. They are independent.

---

## PDF export summary

| View | Who | Trigger | Options |
|------|-----|---------|---------|
| Handout | Student + Instructor | "Download PDF" button on handout sub-tab | Left/right-hand toggle |
| Lesson Plan | Instructor only | "Download PDF" button on lesson plan sub-tab | None (notes column always included) |
| Board | Not exported as PDF | Board is interactive (pan/zoom/draw) — export as screenshot if needed | N/A |

Server-side PDF generation via Playwright. The HTML's `@page` CSS handles pagination. No additional layout logic needed.

---

## Security reminders

- **Lesson plan HTML** contains ECQB question IDs and teaching strategies. NEVER serve to students.
- **Exam question IDs** in the JSON sidecar (`exam.question_ids`) are instructor-only. RLS must filter.
- **Drawing annotations** (SVG layer) should be associated with specific lesson sessions, not the package itself. Different sessions of the same lesson will have different drawings.
- **Sanitize HTML on import.** Strip `<script>`, `onclick`, `onerror`, etc. Keep `<style>`, `<img>`, `<div>`, `<span>`, `<table>`, `<svg>`, etc.
