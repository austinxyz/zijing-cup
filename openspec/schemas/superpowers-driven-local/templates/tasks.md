## 1. <!-- First task group: setup or scaffold -->

### Contract
- **Spec**: <!-- SHALL statements from specs/<cap>/spec.md satisfied by this group — copy verbatim -->
- **Runtime**: `<!-- test command from openspec/config.yaml test_commands -->` → expected: <!-- what passing looks like -->
- **Code**: <!-- key design decisions / risk points from design.md relevant to this group -->
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/{{change}}/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — <!-- failing test for first behavior -->
- [ ] 1.2 GREEN — <!-- minimal implementation to pass 1.1 -->
- [ ] 1.3 RED — <!-- next failing test -->
- [ ] 1.4 GREEN — <!-- minimal impl -->
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. <!-- Next task group: feature work -->

### Contract
- **Spec**: <!-- SHALL statements covered by this group -->
- **Runtime**: `<!-- test command -->` → expected: <!-- passing state -->
- **Code**: <!-- design decisions / risks for this group -->
- **Threshold**: <!-- 80; use 70 if this group contains VISUAL DIFF tasks -->

<!-- For frontend tasks that touch a VIEW / MODAL / named LAYOUT (>50 lines):
     sandwich the GREEN with MOCK + VISUAL DIFF tasks. Example: -->

- [ ] 2.0 CONTRACT — write openspec/changes/{{change}}/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/{{date}}-{{change}}-mocks.html#<anchor>; note design system tokens (see project.design_system in openspec/config.yaml) and verbatim text strings
- [ ] 2.2 RED — <!-- vitest case asserting wrapper.classes() includes the tokens -->
- [ ] 2.3 GREEN — <!-- implement the view -->
- [ ] 2.4 VISUAL DIFF — bring up dev stack (use project.dev_stack_command from openspec/config.yaml); navigate to the route; eyeball rendered UI against the mock; fix any token/color/text drift
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ threshold → PASS; < threshold → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. <!-- Verification + ship -->

<!-- No Contract/EVAL block for this group — verification-and-ship groups run cross-cutting checks, not per-feature harness evaluation -->

- [ ] 3.1 Run backend test suite — ensure no regressions (use project.test_commands from openspec/config.yaml)
- [ ] 3.2 Run frontend test suite — ensure no regressions (use project.test_commands from openspec/config.yaml)
- [ ] 3.3 Run e2e suite if applicable (use project.e2e_command from openspec/config.yaml)
- [ ] 3.4 Run superpowers:verification-before-completion (run project.test_commands from openspec/config.yaml; grep -r console.log on frontend src if applicable; run project.custom_verification_checks from openspec/config.yaml)
