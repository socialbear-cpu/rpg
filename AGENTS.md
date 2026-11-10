# AGENTS.md

## Project operating principles

This repository follows the core ideas from the Superpowers workflow and the Karpathy-inspired coding guidelines:

- Start by clarifying the actual goal and the real constraints.
- Do not guess silently; surface assumptions, tradeoffs, and ambiguities early.
- Prefer the smallest possible change that solves the request.
- Avoid speculative abstractions, broad refactors, and unrelated cleanup.
- Use a brief verification loop: validate with the smallest relevant tests or checks.
- Keep changes surgical and easy to review.

## Working style

- Think before coding: explain the intended behavior and the likely failure modes.
- Simplicity first: prefer direct code over clever abstractions.
- Goal-driven execution: define the success condition before implementation.
- Test-first when practical: add or adjust the smallest failing check, then fix it.
- Keep the implementation aligned with existing project patterns and folder boundaries.

## Project structure

- `backend/`: API and service logic.
- `frontend/`: Next.js app and client-side validation UI.
- `database/`: schema and migration files.
- `supabase/`: supabase configuration and tests.

When changing behavior across layers, keep the backend contract, frontend consumer, and validation tests aligned.

## Constraints

- Do not make unrelated refactors.
- Do not add features beyond the requested scope.
- If a requirement is ambiguous, ask before implementing a likely-but-wrong interpretation.
- If the task is non-trivial, provide a short plan and verification steps before large edits.

## Verification

Use the smallest relevant validation command for the changed area, such as a focused backend test, frontend typecheck, or a narrow Vitest run. Do not run broad suites unless the task clearly requires it.

## References

- https://github.com/obra/superpowers
- https://github.com/multica-ai/andrej-karpathy-skills
