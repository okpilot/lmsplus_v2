# Requirements Document

## Introduction

This spec defines six improvements to the LMS Plus v2 developer workflow -- the process by which the orchestrator (Claude Opus) and the human developer plan, implement, review, and ship changes. These are internal tooling changes that modify agent rules, delegation protocols, and quality gates. No product features, database tables, or user-facing behavior changes.

The root cause driving all six changes: the current review pipeline is post-hoc only. Plans live in ephemeral chat context, critics run after commit, delegation is ad-hoc, and session state is lost on restart. Moving quality checks upstream (specs before code, critics before commit) is the highest-leverage improvement available.

## Alignment with Product Vision

These changes support `product.md` goals indirectly by improving the velocity and correctness of every feature shipped:

- **Reduced review cycles**: Pre-commit critics catch issues 10x cheaper than post-commit agents or CodeRabbit, directly reducing the 24-hour review loops documented in project feedback.
- **Developer velocity**: Persistent specs, task tracking, and structured delegation eliminate rework caused by lost context between sessions.
- **Quality at source**: An interview phase surfaces requirement ambiguities before coding starts, preventing the "cosmetic fix" pattern where issues are implemented literally without questioning root cause.
- **Compliance confidence**: Steering doc drift detection ensures that security rules (`docs/security.md`) and architectural decisions (`docs/decisions.md`) stay aligned with actual code, supporting the compliance-first product principle.

## Requirements

### Requirement 1: Evaluator-Optimizer Loop (Pre-Commit Review)

**Priority:** CRITICAL

**User Story:** As the orchestrator, I want independent critic agents to review plans before execution and code before commit, so that defects are caught at the cheapest possible point rather than in post-commit review or external PR review.

#### Acceptance Criteria

1. WHEN the orchestrator produces a validated plan for any multi-file change, THEN a plan-critic agent (sonnet) SHALL review the plan against the codebase and report issues before execution begins.

2. WHEN the plan-critic reports an ISSUE or CRITICAL finding, THEN the orchestrator SHALL revise the plan and re-submit to the critic. The plan SHALL NOT proceed to execution with unresolved ISSUE or CRITICAL findings.

3. WHEN the plan-critic reports only SUGGESTION-level findings or no findings, THEN the orchestrator SHALL proceed to user approval and execution without delay.

4. WHEN a subagent completes code implementation but before `git commit`, THEN an implementation-critic agent (sonnet) SHALL review the staged changes against the validated plan, checking for logic errors, missed requirements, and pattern violations.

5. WHEN the implementation-critic reports an ISSUE, THEN the implementing agent SHALL revise the code. IF the implementation-critic reports a CRITICAL, THEN the orchestrator SHALL intervene directly.

6. WHEN the implementation-critic and implementing agent have completed two revision rounds without resolving all findings, THEN the orchestrator SHALL take over resolution directly. The system SHALL NOT loop more than 2 revision rounds between critic and implementer.

7. WHEN a change is single-file and under 10 lines, THEN the plan-critic step SHALL be skipped. The implementation-critic SHALL still run.

8. WHEN the pre-commit critic cycle completes clean, THEN the existing post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer) SHALL still run as today. Pre-commit review does NOT replace post-commit review.

### Requirement 2: Formal Spec Artifacts via Spec Workflow MCP

**Priority:** HIGH

**User Story:** As the developer, I want feature plans persisted as structured spec files on disk, so that plans survive session restarts, are reviewable in PRs, and provide a paper trail for architectural decisions.

#### Acceptance Criteria

1. WHEN the orchestrator begins planning any feature that spans 3+ files or introduces a new architectural pattern, THEN a spec SHALL be created using the spec-workflow MCP with at minimum: requirements, implementation plan, and acceptance criteria.

2. WHEN a spec is created, THEN it SHALL be written to `.spec-workflow/specs/<spec-name>/` and committed to the repository alongside the feature branch.

3. WHEN a session ends with in-progress work, THEN the spec on disk SHALL contain enough context for a new session to resume without re-exploring the codebase. At minimum: files changed, files remaining, known blockers, and current status.

4. IF a change is a bug fix, single-file refactor, or under 3 files, THEN a formal spec SHALL NOT be required. The existing plan validation in `agent-workflow.md` is sufficient.

5. WHEN the developer requests a spec, THEN the orchestrator SHALL use the spec-workflow MCP tools (not manual file creation) to create and update the spec, ensuring consistent structure.

6. WHEN a spec reaches "approved" status in the MCP system, THEN the orchestrator SHALL NOT make material changes to the approach without updating the spec and noting the deviation.

### Requirement 3: Requirement Interview Phase

**Priority:** MEDIUM

**User Story:** As the developer, I want the orchestrator to surface requirement ambiguities as explicit questions before implementation starts, so that I can clarify intent upfront rather than discovering misunderstandings in review.

#### Acceptance Criteria

1. WHEN the orchestrator completes the root cause check and draft plan for a multi-file change, THEN it SHALL present a numbered list of clarifying questions covering: scope boundaries (what is explicitly out of scope), behavioral ambiguities (what should happen in edge cases the user did not specify), and priority trade-offs (if the full solution is large, which parts are must-have vs. nice-to-have).

2. IF the orchestrator identifies zero ambiguities after root cause analysis, THEN it SHALL state "No ambiguities identified" and proceed. The interview step SHALL NOT block when there is nothing to ask.

3. WHEN the developer answers the clarifying questions, THEN the orchestrator SHALL incorporate the answers into the plan before proceeding to validation. The answers SHALL be recorded in the spec (if one exists) or in the plan output.

4. WHEN the developer says "skip interview" or equivalent, THEN the orchestrator SHALL proceed without questions. The interview phase SHALL be skippable but default-on.

5. WHEN the change is a bug fix with a clear reproduction path and single root cause, THEN the interview phase SHALL be skipped automatically. Bug fixes with ambiguous scope (e.g., "fix the admin page") SHALL still trigger the interview.

### Requirement 4: Task Persistence

**Priority:** MEDIUM

**User Story:** As the orchestrator, I want to track multi-step work items in a persistent task system, so that progress survives session restarts and the developer can see what remains without re-reading chat history.

#### Acceptance Criteria

1. WHEN the orchestrator begins work on a feature with 5 or more discrete implementation steps, THEN it SHALL create tasks using TaskCreate for each step, with clear titles and status tracking.

2. WHEN a task is started, THEN the orchestrator SHALL update its status to `in_progress` via TaskUpdate. WHEN a task is completed, THEN the orchestrator SHALL update its status to `completed`.

3. WHEN a new session begins and the developer asks to resume work, THEN the orchestrator SHALL check TaskList for outstanding tasks before exploring the codebase.

4. IF a feature has fewer than 5 steps, THEN task creation SHALL NOT be required. The orchestrator MAY use tasks at its discretion for smaller features.

5. WHEN all tasks for a feature are marked completed, THEN the orchestrator SHALL report the completion summary to the developer.

### Requirement 5: Standardized Delegation Protocol

**Priority:** MEDIUM

**User Story:** As the orchestrator, I want a consistent template for every subagent prompt, so that agents receive unambiguous instructions and can execute end-to-end without follow-up questions.

#### Acceptance Criteria

1. WHEN the orchestrator delegates work to any subagent (explore, implement, review, test), THEN the prompt SHALL include all five required sections: TASK (what to do), OBJECTIVE (why it matters), DONE WHEN (measurable exit criteria), CONSTRAINTS (what not to do, file boundaries, line limits), and CONTEXT (relevant file paths, types, patterns to follow).

2. WHEN a subagent prompt is constructed, THEN it SHALL pass the litmus test: "Could this agent execute end-to-end without a follow-up question?" IF the answer is no, THEN the orchestrator SHALL add the missing context before dispatching.

3. WHEN multiple subagents are launched in parallel, THEN each prompt SHALL be self-contained. No subagent prompt SHALL depend on the output of a sibling agent launched in the same batch.

4. WHEN a subagent returns a result that indicates it lacked context (e.g., "I could not find the file" or "unclear which pattern to follow"), THEN the orchestrator SHALL log the missing context as a delegation failure and improve future prompts for that agent type.

5. WHEN the orchestrator delegates to post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer), THEN the existing agent definition files (`.claude/agents/*.md`) SHALL serve as the CONSTRAINTS and CONTEXT sections. The delegation template SHALL supplement, not duplicate, those definitions.

### Requirement 6: Steering Document Drift Detection

**Priority:** LOW-MEDIUM

**User Story:** As the developer, I want the doc-updater agent to detect when committed code creates drift from steering documents, so that architectural decisions and product requirements stay aligned with the actual implementation.

#### Acceptance Criteria

1. WHEN the doc-updater agent runs post-commit, THEN it SHALL compare the diff against the steering documents in `.spec-workflow/steering/` (product.md, tech.md, structure.md) and report any drift.

2. IF the diff introduces behavior that contradicts a statement in a steering document (e.g., tech.md says "no API routes for mutations" but the diff adds a mutation route handler), THEN the doc-updater SHALL report it as a DRIFT finding with the specific steering doc reference, the contradicting code, and a suggested resolution.

3. WHEN the doc-updater reports a DRIFT finding, THEN the orchestrator SHALL surface it to the developer. The doc-updater SHALL NOT edit steering documents directly -- steering docs require explicit developer approval to change.

4. IF the drift is intentional (the developer confirms the code is correct and the steering doc is outdated), THEN the orchestrator SHALL update the steering doc via the spec-workflow MCP approval process.

5. IF the drift is unintentional (the code should match the steering doc), THEN the orchestrator SHALL treat it as an ISSUE and fix the code in the same session.

6. WHEN no steering documents exist in `.spec-workflow/steering/`, THEN the drift detection step SHALL be skipped without error.

## Non-Functional Requirements

### Code Architecture and Modularity

1. All new agent rules SHALL be written as standalone markdown files in `.claude/rules/` or `.claude/agents/`, following the existing pattern of one file per agent with DO/NEVER sections and severity tables.

2. The delegation protocol template SHALL be defined in `agent-workflow.md` as a new section, not as a separate file. It extends the existing orchestrator rules.

3. The plan-critic and implementation-critic SHALL be defined as new agent files (`.claude/agents/plan-critic.md`, `.claude/agents/implementation-critic.md`) following the same structure as existing agent definitions.

4. No changes to production application code, database schema, migrations, or user-facing behavior SHALL result from this spec. All changes are confined to `.claude/`, `.spec-workflow/`, and `docs/` directories.

### Performance

1. The plan-critic agent SHALL complete within 60 seconds for plans covering up to 10 files. Plans exceeding 10 files MAY take longer but SHALL not exceed 120 seconds.

2. The implementation-critic agent SHALL complete within 90 seconds for diffs under 500 lines. The 2-round revision cap ensures the pre-commit cycle adds at most 5 minutes to a commit.

3. The total pre-commit overhead (implementation-critic + up to 2 revisions) SHALL NOT exceed the existing post-commit agent cycle time. The goal is to shift work earlier, not add a second full cycle.

4. The interview phase SHALL add zero overhead when there are no ambiguities (orchestrator states "no ambiguities" and proceeds).

### Security

1. No new secrets, API keys, environment variables, or service accounts SHALL be required for any change in this spec.

2. Steering document drift detection SHALL flag security-sensitive drift (changes contradicting `docs/security.md` or `.claude/rules/security.md`) at CRITICAL severity, not just DRIFT.

3. The delegation protocol SHALL include a CONSTRAINTS field that explicitly lists security boundaries the agent must not cross, derived from the existing NEVER lists in CLAUDE.md.

### Reliability

1. IF any new agent (plan-critic, implementation-critic) fails to respond or times out, THEN the orchestrator SHALL proceed with a warning to the developer rather than blocking indefinitely. Agent failures SHALL NOT deadlock the workflow.

2. IF the spec-workflow MCP is unavailable (server not running), THEN the orchestrator SHALL fall back to writing spec files manually using the existing template structure. MCP unavailability SHALL NOT block work.

3. IF TaskCreate/TaskUpdate tools are unavailable, THEN the orchestrator SHALL fall back to tracking tasks in the session summary. Tool unavailability SHALL NOT block work.

### Usability

1. The developer SHALL be able to skip any new workflow step by saying "skip" (interview, plan-critic, spec creation). All new steps are default-on but overridable.

2. New workflow steps SHALL integrate into the existing 9-step workflow documented in CLAUDE.md, not create a parallel workflow. The updated flow SHALL be documentable as a single pipeline.

3. The delegation protocol template SHALL be concise enough to construct in under 30 seconds per agent prompt. Over-engineering the template defeats the purpose.

4. Findings from pre-commit critics SHALL use the same severity levels (CRITICAL, ISSUE, SUGGESTION, GOOD) as the existing semantic-reviewer to avoid introducing new terminology.

## Out of Scope

The following are explicitly NOT part of this spec:

- **Full autonomous agents**: The system remains human-supervised. No change to the approval gates or user sign-off requirements.
- **Spec-as-Source (code generation from specs)**: Specs are planning and documentation artifacts, not executable templates. Code is still written by agents and reviewed by humans.
- **Removing post-commit agents**: Pre-commit review is additive. The four post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer) and the learner continue to run unchanged.
- **Product features or database changes**: No migrations, no new tables, no new RPCs, no UI changes. This spec is purely workflow and tooling.
- **CI/CD pipeline changes**: No new GitHub Actions workflows. All changes are local to the Claude Code session.
- **External tool integration**: No new MCP servers beyond the already-installed spec-workflow MCP. No new dependencies.
