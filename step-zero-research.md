---
date: 2026-03-10
tags: [research, training-platform, claude-code, automation, ux, step-zero]
status: active
project: training-platform
---

# Step Zero Research — Claude Code Automation & UX Inspiration

> Research completed 2026-03-10. Both tracks in parallel. Ready for decision-making.

---

## TRACK 1: Claude Code Automation Pipeline

### The Big Picture

Claude Code in 2026 is no longer just "AI in your terminal." It's a full **agentic development platform** with four key extension points: **hooks**, **subagents**, **plugins**, and **skills**. Think of it like an aircraft systems architecture — each system has a specific job, and together they keep the flight running smoothly.

Here's what each one does (plain language):

| Extension | What It Is | Aviation Analogy |
|-----------|-----------|-----------------|
| **Hooks** | Shell commands that fire automatically at specific lifecycle points (before a tool runs, after a file edit, when a session starts/ends). Deterministic — they ALWAYS fire, unlike instructions in CLAUDE.md which are "advisory." | Standard Operating Procedures — they happen every time, no matter what |
| **Subagents** | Specialized AI assistants that Claude can delegate work to. Each runs in its own isolated context window, so they don't pollute your main conversation. | Crew members — the FO handles comms while the captain flies |
| **Plugins** | Packages that bundle hooks, subagents, commands, and skills together. Install what you need. Over 9,000 available as of Feb 2026. | Avionics upgrade packages — snap in new capability |
| **Skills** | Markdown files that teach Claude HOW to think about a category of work. Not step-by-step scripts, but decision frameworks. | Type rating — teaching the pilot how to fly a specific aircraft |

### Hook System — Your Automated Crew

Hooks are the backbone of automation. They fire at specific lifecycle events and give you **deterministic control** (as opposed to CLAUDE.md which is more like "please try to remember this").

**Key hook events for our pipeline:**

| Hook Event | When It Fires | What We Use It For |
|-----------|--------------|-------------------|
| `SessionStart` | When Claude Code starts/resumes | Inject project context, load current git branch, recent commits |
| `PreToolUse` | Before any tool executes | Block dangerous commands, protect sensitive files (.env, migrations) |
| `PostToolUse` | After a tool completes | Auto-format code (Prettier/ESLint), run relevant tests |
| `Stop` | When Claude finishes responding | Verify work is actually done (prompt hook), run test suite, notify you |
| `UserPromptSubmit` | When you submit a prompt | Add context, validate prompts |

**Three types of hooks (this is powerful):**

1. **Command hooks** (`"type": "command"`) — Run a shell command. Simple. `exit 0` = allow, `exit 2` = block.
2. **Prompt hooks** (`"type": "prompt"`) — Send a prompt to a fast Claude model for single-turn evaluation. Example: "Did Claude actually finish all the tasks the user asked for?"
3. **Agent hooks** (`"type": "agent"`) — Spawn a full subagent with tool access (Read, Grep, Glob) for deep verification. The heavy artillery.

**Configuration lives in JSON settings files at four levels:**
- `~/.claude/settings.json` — User-level (applies to all projects)
- `.claude/settings.json` — Project-level (commit to git, shared with team)
- `.claude/settings.local.json` — Local project (your machine only, gitignored)
- Enterprise-level (org-wide policy)

### Recommended Automation Pipeline for Our Project

Based on the research, here's the **maximum automation** setup mapped to your "crew" table:

#### 1. Linter/Formatter (PostToolUse hook)
- **What:** Auto-run Prettier + ESLint after every file edit
- **How:** PostToolUse hook with matcher for file write tools
- **Pro tip from the community:** Format on the `Stop` event rather than after every individual edit — formatting after each edit sends a "files changed" reminder that eats context window. Format once when Claude is done.

#### 2. Test Runner (Stop hook)
- **What:** Run relevant tests when Claude finishes a task
- **How:** Stop hook + prompt hook that checks "did Claude run tests? Should tests be run?"
- **Tools:** Jest for unit tests, Playwright for E2E (Playwright now ships with three Claude Code subagents: planner, generator, and healer)
- **Key repo:** `tdd-guard` (⭐ 1.7k) — Automated TDD enforcement for Claude Code

#### 3. Code Reviewer (Subagent)
- **What:** AI reviews code for quality, patterns, bugs, security
- **How:** Custom subagent that runs `git diff`, reviews changes, provides prioritized feedback
- **Key repos:**
  - `Local-Review` plugin — Runs 5 agents in parallel for comprehensive code reviews, only flags issues scored 80+
  - `awesome-claude-code-subagents` by VoltAgent (⭐ 622) — 100+ production-ready subagents including code reviewer
  - Trail of Bits' `claude-code-config` — Opinionated, security-focused setup from a top security firm

#### 4. Security Reviewer (PreToolUse hook + Subagent)
- **What:** Block dangerous operations, scan for vulnerabilities and secrets
- **How:** PreToolUse hook blocks writes to .env, production config, .git. Subagent runs security audit on changes.
- **Key repos:**
  - Trail of Bits' config includes security-focused hooks and agents
  - `Shipyard` plugin — Includes dedicated auditor agent for security checks
  - `dotclaude` (⭐ 185) — Specialized agents for code review and security analysis

#### 5. Doc Updater (Stop hook)
- **What:** Auto-update docs when code/API changes
- **How:** Stop hook that detects API changes and triggers doc update subagent
- **Can also:** Auto-update CHANGELOG, README sections

#### 6. Desktop Notifications (Stop hook)
- **What:** Ping you when Claude finishes or needs input
- **How:** Stop hook running `notify-send` (Linux) or `osascript` (macOS)
- **Key repo:** `peon-ping` (⭐ 2.4k) — Warcraft III Peon voice notifications for Claude Code (yes, really — and it's the 2nd most starred Claude Code plugin)

### Top GitHub Repos & Plugins to Evaluate

**Tier 1 — Start here (highest value, most relevant):**

| Repo/Plugin | Stars | What It Does | Why It Matters |
|------------|-------|-------------|---------------|
| `trailofbits/claude-code-config` | — | Opinionated defaults from a top security firm | Security-first, battle-tested, includes weekly `/insights` review workflow |
| `tdd-guard` | 1.7k | Automated TDD enforcement | Forces test-first development — perfect for our "build ugly but tested" approach |
| `Continuous-Claude-v2` | 2.2k | Context management via ledgers and handoffs | Solves the context window problem for long sessions |
| `cc-sessions` | 1.5k | Opinionated extension set (hooks, subagents, commands, task/git management) | Complete dev workflow in a box |
| `VoltAgent/awesome-claude-code-subagents` | 622 | 100+ production-ready subagents | Pick the ones you need (code-reviewer, test-writer, security-auditor) |

**Tier 2 — Worth investigating:**

| Repo/Plugin | Stars | What It Does |
|------------|-------|-------------|
| `CCPlugins` | 2.6k | "Plugins that actually save time" — community favorite |
| `wshobson/agents` | — | 112 specialized agents, 72 plugins, 146 skills — massive but modular |
| `Superpowers` plugin | — | Structured lifecycle (GSD), TDD discipline, IaC validation |
| `commands` | 1.7k | Production-ready slash commands collection |
| `ccundo` | 1.3k | Granular undo functionality (safety net!) |
| `claude-code-specs-generator` | 38 | Generate specs from codebase (Amazon Kiro-inspired) |

**Tier 3 — Nice to have:**

| Repo/Plugin | What It Does |
|------------|-------------|
| Playwright agents | Specialized E2E test subagents (planner, generator, healer) |
| `Firecrawl` plugin | Web scraping for research within Claude Code |
| `Context7` plugin | Always-current API docs (replaces stale training data) |

### CLAUDE.md Best Practices (Critical for Our Project)

The community consensus in 2026 is that CLAUDE.md is as important as .gitignore. Key findings:

**Structure:**
- Keep root CLAUDE.md to **50-100 lines** (some say under 200). Our personal CLAUDE.md is already quite detailed — the project CLAUDE.md should be leaner.
- Use **Progressive Disclosure**: Don't dump everything in CLAUDE.md. Instead, reference separate files:
  ```
  agent_docs/
  ├── building_the_project.md
  ├── running_tests.md
  ├── code_conventions.md
  ├── service_architecture.md
  ├── database_schema.md
  ```
- Use `.claude/rules/` to split large instruction sets
- For monorepos: use **ancestor + descendant** CLAUDE.md loading (root applies everywhere, child applies in that directory)

**Content — include:**
- WHAT: tech stack, project structure, codebase map
- WHY: project purpose, what each part does
- HOW: build commands, test commands, deployment process
- Gotchas: weird workarounds, files that should never be modified

**Content — exclude:**
- Don't try to be a linter (use actual linters via hooks)
- Don't stuff every possible command (progressive disclosure)
- Don't auto-generate it (too generic) — write it manually

**Workflow tips:**
- Start every task in **Plan Mode** (Shift+Tab twice) — Claude reads and plans without making changes
- Use `/clear` between unrelated tasks
- Manual `/compact` at max 50% context usage
- Write plans to external files (plan.md) for persistence across sessions
- Run `/insights` weekly to analyze what's working

### Recommended Pipeline Configuration

```
.claude/
├── settings.json          ← Project hooks (shared via git)
├── settings.local.json    ← Local overrides (gitignored)
├── agents/
│   ├── code-reviewer.md   ← Code review subagent
│   ├── test-writer.md     ← Test generation subagent
│   ├── security-auditor.md ← Security scanning subagent
│   └── doc-updater.md     ← Documentation update subagent
├── commands/
│   ├── review.md          ← /project:review command
│   ├── test.md            ← /project:test command
│   └── deploy.md          ← /project:deploy command
├── skills/
│   ├── nextjs-patterns.md ← Next.js best practices
│   ├── supabase-rls.md    ← Supabase RLS patterns
│   └── block-system.md    ← Our block architecture conventions
└── rules/
    ├── code-style.md      ← TypeScript/React conventions
    └── security.md        ← Security requirements
```

---

## TRACK 2: UX Research & Inspiration

### A. Content/Lesson Builders

**The landscape:** Tools range from enterprise authoring suites (Articulate 360 at $1,099/year) to free open-source options (H5P, Adapt Learning). For our purposes, we're not buying any of these — we're **stealing UX ideas** for our own builder.

#### Key Players to Study

| Tool | UX Model | Steal This Idea |
|------|---------|----------------|
| **Articulate Rise 360** | Block-based, mobile-first. Drag-and-drop "lesson blocks" (text, image, video, quiz, interaction) in a vertical flow. Dead simple. | **The vertical block flow.** This is essentially what we're building. Rise proves the model works for non-technical content creators. |
| **Articulate Storyline 360** | Slide-based, PowerPoint-like. Complex branching, triggers, variables. | **Branching scenarios** for future block types (PIC decision trees). Also: their "triggers and variables" system for conditional content. |
| **H5P** | Plugin-based, 40+ content types. Each type is a self-contained interactive widget. Open source. | **The content type plugin model.** Each H5P content type = our "block type." Their architecture is literally what we're designing. Study their content type API closely. |
| **Canva** | Template-first design. Drag elements onto a canvas. AI-assisted generation. | **AI-assisted slide generation.** Canva's approach to "describe what you want → get a design" is exactly what we want for presentation blocks. |
| **Notion** | Block-based document editor. Slash commands to insert block types. Drag to reorder. | **The slash command UX for inserting blocks.** Type "/" → pick block type → configure. Incredibly intuitive. |
| **Adapt Learning** | Open-source, modular plugin ecosystem (100+ plugins), JSON-based course format. | **JSON lesson format + plugin architecture.** Adapt is the closest open-source analog to our lesson format vision. Study their JSON schema. |
| **Compozer** | Cloud-based, drag-and-drop, SCORM export, freemium. | **Clean, modern UI** for non-technical users. Good example of "simple by default, powerful when needed." |
| **Easygenerator** | AI-powered: turns existing content into interactive training. 75-language auto-translate. | **AI content transformation.** "Paste your notes → get an interactive lesson" is a powerful workflow for instructors. |

#### Key UX Patterns to Adopt

1. **Vertical block flow** (Rise 360, Notion) — lessons are a top-to-bottom sequence of blocks. Simple, intuitive, mobile-friendly.
2. **Slash command insertion** (Notion) — type "/" to add a new block. No separate palette needed.
3. **Drag-and-drop reordering** — every builder does this. Table stakes.
4. **Preview mode** — "play" the lesson as a student would see it. Essential for content creation confidence.
5. **Template library** — pre-built lesson templates ("Intro + Theory + Activity + Assessment + Debrief") that instructors can customize.
6. **AI generation** — describe what you want, get a draft. For slides especially.

#### Open Source to Study Deeply

- **H5P** (content type architecture, plugin API): https://h5p.org/
- **Adapt Learning** (JSON course format, plugin ecosystem): https://www.adaptlearning.org/
- **Open eLearning** (free, desktop/offline, SCORM, privacy-focused): worth a look for privacy-first inspiration

### B. Question Bank / Quiz Tools

#### Aviation-Specific Competitors

| Tool | Key Features | Steal This Idea |
|------|-------------|----------------|
| **Aviationexam** | 16,000+ questions, explanations, flashcards, offline apps. The industry standard for ATPL. Recently launched flashcards feature. | **Flashcards integration** — questions can double as flashcards. Also: their explanation quality (student comments + professional explanations). |
| **ATPLQuestions.com** | "Seen on real exam" tags from student feedback. Special ATO interface for assigning custom tests. Video explanations from community. | **ATO instructor interface** for assigning tests. "Seen on real exam" crowd-sourced tagging. Community video explanations. |
| **ATPLQuiz.ai** | Spaced repetition with forgetting curve prediction. AI tutor ("Charlie") for on-demand explanations. Multi-area quiz builder with KeyConcept filters. | **Spaced repetition algorithm.** AI tutor for instant explanations. KeyConcept filters for ultra-specific practice. Daily database updates from exam feedback. |
| **PPLQuestions.eu** | 2,700+ PPL questions, spaced repetition, offline support, multi-language (EN/RO/DE/FR), 1-on-1 instructor sessions. | **Spaced repetition + instructor booking** in one platform. Smart scheduling with daily goals. Offline-first with sync. |
| **AirQuiz** | "Learn the subject, not the answers" philosophy. Detailed explanations with suggested areas for further study. Recommended by examiners. | **Learning-focused feedback** not just "correct/incorrect" but "here's what you should study more." Examiner endorsements = trust. |
| **PPL Exam Prep** | 20,000+ users, structured learning approach, progress tracking. Clean, glitch-free interface. | **Structured learning paths** — not just random questions but a guided study journey. Clean UX that "just works." |

#### General Quiz/Learning Tools

| Tool | Steal This Idea |
|------|----------------|
| **Anki** | The gold standard for spaced repetition. Open source. Study their algorithm (SM-2 variant). |
| **Quizlet** (now Wayground) | Social learning features, multiplayer quizzes. Evolved from quiz tool to learning platform. |
| **Kahoot!** | Gamification: competitive real-time quizzes. Points, leaderboards, music/countdown timers. Fun factor. |
| **Wooclap** | Polling, brainstorming, word clouds — engagement during live sessions. Real-time participation. |

#### Key UX Patterns for Question Bank Trainer

1. **Spaced repetition** — scientifically proven, every serious tool uses it. Our implementation should use a variant of SM-2 (or SM-18/FSRS which are newer and better).
2. **Topic/subtopic drill-down** — select subject → topic → subtopic. Filter by difficulty, by "seen/unseen," by score.
3. **Immediate feedback with explanations** — not just "wrong" but WHY it's wrong and what to study.
4. **Progress dashboard** — weak areas highlighted, improvement trends over time, "readiness score" for each subject.
5. **Mock exam mode** — timed, randomized, simulating real exam conditions.
6. **Offline-first** — questions cached on device, progress syncs when back online.
7. **AI tutor** — ask "why?" about any question and get an explanation (our Claude API advantage).

### C. Live Teaching Platforms (The Closest to Our Vision)

This is where it gets interesting. **Nobody is doing exactly what we're building.** But some come close:

#### Closest Matches

| Platform | What It Does | How Close to Our Vision | Gap We Fill |
|---------|-------------|----------------------|------------|
| **Nearpod** | Interactive lessons pushed to student devices. Instructor controls pace. Polls, quizzes, draw-it activities, VR field trips. 22,000+ lesson library. | **VERY close** for the live session model. Instructor controls slides, students interact on their devices. | No video conferencing built in. No LMS backbone. No aviation focus. No question bank. No self-study mode. |
| **Pear Deck** | Google Slides add-on. Embeds interactive questions into slide presentations. Every student responds privately. Live dashboard for instructor. | **Close** for the "interactive slides" concept. | Depends on Google (dealbreaker). Limited block types. No standalone platform. |
| **ClassIn** | Purpose-built virtual classroom. Student-centered. Interactive content + video. Used globally. | **Close** for the "one-window" vision. Video + content + interaction. | Not a builder. No block architecture. No question bank integration. |
| **BigBlueButton** | Open-source virtual classroom. Embedded in 75% of LMS systems (Moodle, Canvas, etc.). Whiteboard, breakout rooms, polls. | **Useful** as potential video component (like Jitsi). Self-hostable, open source. | It's a video platform with teaching features bolted on, not a content-first platform. |
| **Engageli** | "Interactive recordings with embedded polls, notes, and discussions." Engageli Studio for interactive self-paced content. | **Interesting** for the self-study mode concept. | Enterprise pricing. Not customizable. |
| **BrainCert** | Virtual classroom with HTML5 whiteboard, video, breakout rooms. Serves education + corporate + aviation explicitly mentioned. | **Worth studying** — one of the few that mentions aviation. | Still a generic platform, not purpose-built for structured training with compliance tracking. |
| **LearnCube** | Built for tutors (especially language teachers). Browser-based. Scheduling, interactive whiteboard, AI ESL tools. | **Good UX reference** for the tutor/instructor experience. | 1-on-1 focused, not classroom. |

#### The Gap We're Filling (Competitive Positioning)

```
EXISTING WORLD:

Video Platform (Zoom/Jitsi)     ← live but passive
    +
Slide Tool (PowerPoint)          ← content but not interactive
    +
LMS (Moodle)                     ← tracking but separate
    +
Activity Tool (Kahoot/H5P)      ← engagement but another tab
    +
Question Bank (Aviationexam)     ← practice but not connected

= 5 tools, 5 tabs, 5 logins, zero integration

OUR WORLD:

One app. One window. One login.
Builder → Player → LMS backbone.
Everything tracked. Everything connected.
Purpose-built for regulated aviation training.
```

**Nearpod is our closest UX reference** for the live session model, but even Nearpod doesn't have:
- A dedicated lesson builder with extensible block architecture
- A question bank with spaced repetition
- An LMS backbone with EASA compliance tracking
- Embedded video conferencing
- Self-study mode as a distinct experience
- Multi-tenant architecture for commercial deployment

---

## Decisions — CONFIRMED ✅

All five foundation decisions made 2026-03-10:

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **Repo structure** | Monorepo with Turborepo | Shared DB schema, question bank, auth, LMS backbone. Claude Code's hierarchical CLAUDE.md designed for this. Turborepo made by Vercel (our host). |
| 2 | **Claude Code automation** | Full crew from day one | All hooks + subagents: formatter, test runner, code reviewer, security auditor, doc updater, file protection, notifications, context injection. |
| 6 | **Automation approach** | Cherry-pick patterns, write our own (~200 lines) | No bloated framework installs. Study Trail of Bits, tdd-guard, VoltAgent for patterns. Write lean, stack-specific hooks/agents we fully understand. Only exception: Playwright official agents (lightweight, useful). |
| 3 | **Spaced repetition** | FSRS | Modern, open-source, provably more efficient than SM-2. Anki adopted it officially. JS implementations available. |
| 4 | **AI-to-slides pipeline** | Claude API → Structured JSON → Template Renderer | Separates content from presentation. Consistent visual quality. JSON is part of lesson format. Templates reusable and swappable. |
| 5 | **Monorepo tool** | Turborepo (not Nx) | Simpler, Vercel-native, Claude Code knows it well. Nx is overkill for our team size. |

---

## Next Steps

Research ✅ and decisions ✅ are done. We're ready for execution:

### Immediate (Next Session)
1. **Set up the monorepo** — Turborepo + Next.js apps + shared packages
2. **Configure Claude Code automation** — Full hook pipeline, subagents, CLAUDE.md hierarchy
3. **Configure Supabase** — Auth, database, RLS policies
4. **Configure Vercel** — Deployment pipeline for both apps

### Then
5. **Define JSON schemas** — Question bank format, lesson/block format
6. **Define database schema** — Users, orgs, courses, lessons, progress, question banks
7. **Break MVP 1 & MVP 2 into stories and tasks** — Magentic workflow + three-perspective consensus
8. **BUILD** 🛫

---

*Research completed: 2026-03-10 | Ready for: Decision & Setup*
