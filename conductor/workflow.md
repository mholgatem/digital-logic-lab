# Project Workflow

## Guiding Principles

1. **The Plan is the Source of Truth:** All work must be tracked in `plan.md`
2. **The Tech Stack is Deliberate:** Changes to the tech stack must be documented in `tech-stack.md` *before* implementation
3. **Test-Driven Development:** Write unit tests before implementing functionality
4. **Targeted Code Coverage:** Aim for >50% code coverage for all modules
5. **User Experience First:** Every decision should prioritize user experience
6. **Non-Interactive & CI-Aware:** Prefer non-interactive commands. Use `CI=true` for watch-mode tools (tests, linters) to ensure single execution.

## Task Workflow

All tasks follow a strict lifecycle:

### Standard Task Workflow

1. **Select Task:** Choose the next available task from `plan.md` in sequential order

2. **Mark In Progress:** Before beginning work, edit `plan.md` and change the task from `[ ]` to `[~]`

3. **Write Failing Tests (Red Phase):**
   - Create a new test file for the feature or bug fix.
   - Write one or more unit tests that clearly define the expected behavior and acceptance criteria for the task.
   - **CRITICAL:** Run the tests and confirm that they fail as expected. This is the "Red" phase of TDD. Do not proceed until you have failing tests.

4. **Implement to Pass Tests (Green Phase):**
   - Write the minimum amount of application code necessary to make the failing tests pass.
   - Run the test suite again and confirm that all tests now pass. This is the "Green" phase.

5. **Refactor (Optional but Recommended):**
   - With the safety of passing tests, refactor the implementation code and the test code to improve clarity, remove duplication, and enhance performance without changing the external behavior.
   - Rerun tests to ensure they still pass after refactoring.

6. **Verify Coverage:** Run coverage reports using the project's chosen tools. Target: >50% coverage for new code.

7. **Document Deviations:** If implementation differs from tech stack:
   - **STOP** implementation
   - Update `tech-stack.md` with new design
   - Add dated note explaining the change
   - Resume implementation

8. **Task Completion:**
   - When a task is finished, update its status from `[~]` to `[x]` in `plan.md`.
   - **Note:** Commits will be made at the end of each phase, not per task.

### Phase Completion Verification and Checkpointing Protocol

**Trigger:** This protocol is executed immediately after all tasks in a phase in `plan.md` are marked as complete.

1.  **Announce Protocol Start:** Inform the user that the phase is complete and the verification and checkpointing protocol has begun.

2.  **Ensure Test Coverage for Phase Changes:**
    -   **Step 2.1: Determine Phase Scope:** Identify the files changed in this phase since the last checkpoint.
    -   **Step 2.2: List Changed Files:** Use git to list all files modified during this phase.
    -   **Step 2.3: Verify and Create Tests:** Ensure corresponding test files exist for all new or modified code.

3.  **Execute Automated Tests with Proactive Debugging:**
    -   Announce and run the automated test suite.
    -   Debug and fix any failures (up to two attempts).

4.  **Propose a Detailed, Actionable Manual Verification Plan:**
    -   Generate a step-by-step plan for the user to manually verify the phase's goals.

5.  **Await Explicit User Feedback:**
    -   **PAUSE** and await the user's "yes" or feedback.

6.  **Commit Phase Changes:**
    -   Stage all changes (code and `plan.md`).
    -   **Step 6.1: Draft Commit Message:** Create a detailed commit message. The body of the commit message MUST include a summary of all tasks completed in this phase, a list of created/modified files, and the core "why" for the changes.
    -   **Step 6.2: Perform Commit:** Execute the commit with the detailed message.

7.  **Record Phase Checkpoint SHA:**
    -   **Step 7.1: Get Commit Hash:** Obtain the hash of the phase commit.
    -   **Step 7.2: Update Plan:** Read `plan.md`, find the heading for the completed phase, and append the first 7 characters of the commit hash in the format `[checkpoint: <sha>]`.
    -   **Step 7.3: Write Plan:** Write the updated content back to `plan.md`.

8.  **Announce Completion:** Inform the user that the phase is complete and the checkpoint has been created.

## Quality Gates

Before marking any task complete, verify:

- [ ] All tests pass
- [ ] Code coverage meets requirements (>50%)
- [ ] Code follows project's code style guidelines
- [ ] All public functions/methods are documented
- [ ] Type safety is enforced
- [ ] No linting or static analysis errors
- [ ] Works correctly on mobile (if applicable)
- [ ] Documentation updated if needed

## Development Commands

### Setup
```bash
npm install
```

### Daily Development
```bash
# Using Python for local server
python -m http.server 8000
```

### Testing
```bash
# Example for running tests (to be refined as test suite grows)
npm test
```

## Definition of Done

A task is complete when:

1. All code implemented to specification
2. Unit tests written and passing
3. Code coverage meets project requirements (>50%)
4. Documentation complete (if applicable)
5. Code passes all configured linting and static analysis checks
6. Implementation notes added to `plan.md`
7. Changes ready for phase commit
