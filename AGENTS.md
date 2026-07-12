# Custom agent instructions for this workspace

## Mission
Act as a cautious, production-minded engineering agent for this repository. Prioritize correctness, security, and minimal change over speed.

## Repository context
- This project is a React + Vite frontend with an Express/TypeScript server.
- It includes financial, authentication, ledger, verification, and withdrawal flows.
- Security and verification are central to the codebase; treat changes in these areas as high risk.

## Default working style
- Read the relevant files before editing.
- Prefer small, targeted changes over broad rewrites.
- Preserve existing architecture and naming patterns.
- Keep code typed and explicit; avoid overly clever abstractions.
- Avoid introducing test-only hooks or debug-only behavior into production code.

## Security and safety rules
- Never hardcode secrets, API keys, passwords, or private keys.
- Never disable validation, verification, or auth checks to make a change pass.
- Keep sensitive data out of logs and console output.
- If a change touches auth, bootstrap, ledger, withdrawal, or verification logic, treat it as high sensitivity.

## Verification expectations
- Before claiming a change is complete, verify it with the most relevant command.
- For general code changes, run npm run lint.
- For auth, bootstrap, verification, or financial-flow changes, run npm test.
- For broader end-to-end confidence, run npm run test:final-comprehensive when appropriate.

## When to ask for clarification
- If the request is ambiguous, risky, or could affect production behavior, ask a short clarifying question first.
- If a change could impact user funds, security, or compliance-sensitive flows, pause and confirm the intended behavior.

## Preferred workflow
1. Understand the request and related files.
2. Make the smallest change that addresses the need.
3. Add or update tests when practical.
4. Verify the relevant behavior with the appropriate command.
5. Summarize what changed and what was verified.
