---
name: "OPSX: Update"
description: Revise a change's existing planning artifacts and keep them coherent — never edits code
category: Workflow
tags: [workflow, artifacts, experimental]
---

Revise an in-flight change's planning artifacts (requirements copy, proposal, specs, design, mocks, tasks) and keep them coherent with one another. Adapted from upstream OpenSpec's `/opsx:update` workflow (v1.6+), extended with the superpowers-driven schema's Contract and Signadot invariants. **Never edits implementation code.**

**Input**: Optionally specify a change name. If omitted, infer from conversation context; if ambiguous, run `openspec list --json` and use **AskUserQuestion** with the 3-4 most recently modified changes (mark the most recent "(Recommended)").

---

**Steps**

### 1. Select the change

Announce: "Using change: `<name>`. Override: `/opsx:update <other>`."

### 2. Get current state

```bash
openspec status --change <name> --json
```

Use `artifactPaths.<id>.existingOutputPaths` for the concrete files on disk. Do NOT write to `resolvedOutputPath` for glob artifacts (`specs/**/*.md`) — it's the pattern, not a file.

### 3. Understand the request

- Specific revision requested ("the design now uses X") → that's the starting edit.
- Bare "update" / "make coherent" → coherence review: read all existing artifacts, check them against each other for contradictions, gaps, duplication.

### 4. Read and reconcile — in ANY direction

Apply the requested edit, then check every other existing artifact against it. An edit to a later artifact may require revising an earlier one (build order is a reading order, not a revision constraint).

**Schema-specific coherence checks (this is what upstream doesn't know about):**

- **Contract blocks** — if a spec SHALL statement changed, re-check every `### Contract` block in `tasks.md` whose Spec field quotes it (verbatim copies go stale silently). If design decisions changed, re-check Code fields.
- **Contract files already written** — if apply already ran `N.0 CONTRACT` for an affected group, `openspec/changes/<name>/contracts/group-N.md` must be updated to match the revised block.
- **Signadot plans** — if a revised behavior has a bound plan (`Runtime: validated by signadot plan \`<id>\``), re-check `signadot-plans/<id>.yaml`: selectionHint prose, declared params, and assertions must still describe the revised behavior. Flag if the plan needs re-validation at N.V.
- **Requirements copy** — the canonical requirements live at `docs/superpowers/specs/<date>-<name>-requirements.md`; the change dir holds a copy (`requirements.md`). If requirements are being revised, update BOTH, and re-run the Phase 3 review discipline (status stays REVIEWED only if the review checklist passes again).
- **Groups already EVAL-passed** — if a revision touches a group whose `N.E EVAL` is `[x]`, warn: the eval verdict no longer covers the revised contract. Offer to uncheck `N.E` (and `N.V` if present) so apply re-runs the gate.

Revise only files that already exist. Do NOT create missing artifacts — that's `/opsx:propose` step 3's job (point the user there).

### 5. Confirm and apply, one artifact at a time

Show each proposed revision and why. Write only after the user confirms. Rejected → leave unchanged. For substantial rewrites, fetch the artifact's rules first:

```bash
openspec instructions <artifact-id> --change <name> --json
```

### 6. Point to the next step (guidance only — never act on it)

- Artifacts still missing → `/opsx:propose <name>` (its artifact walk resumes where status shows gaps)
- Tasks partially done and plan revised → `/opsx:apply <name>` to carry the delta into code (re-running any unchecked gates)
- Everything done → `/opsx:archive <name>`

**Output**: which artifacts were revised (and which proposals were rejected), what was deferred, recommended next command.

---

**Guardrails**

- Planning artifacts only — NEVER edit implementation code. Revised plan implies code changes → stop, point to `/opsx:apply`.
- Use artifact ids/paths from `openspec status`; never hardcode.
- NEVER mark eval/validate checkboxes done from this command — only apply's gates do that.
- If the request changes the change's *intent* rather than refining it, recommend a fresh change (`/opsx:explore <new-topic>`) instead — the Update vs. Start Fresh heuristic.
- Contract Spec fields are verbatim copies of SHALL statements — after any spec edit, grep tasks.md for the old wording to catch stale copies.
