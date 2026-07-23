# Working in this repo

This is an experimental, pre-release product repo.
Do not worry about things like backwards compatibility, migrating functionality for existing users, etc.

## Infrastructure

[almanac/README.md](./almanac/README.md)

## General Guidance

Before editing files, read `dangerfile.ts` and never modify paths matched by its `PROTECTED_PATHS` rules.
Source files can also contain comment-only `agent-guard:off` and `agent-guard:on` markers.
Agents must not modify content between those markers.
Treat changes to guard rules or markers as explicit policy changes, never as a workaround for a blocked edit.

Run `npm run typecheck`, `npm test`, and `npm run build` before changing shared
infrastructure.

Use gitmoji in commit messages and PR titles.

Every coding agent that writes code for a pull request must identify itself in the pull request's commit history.
Use the agent as the commit author or add a `Co-authored-by: Agent Name <agent-email>` trailer to at least one commit.
The name must clearly identify the agent (for example, `Codex Agent`, `Claude Agent`, or `Cursor Agent`) because agent-only CI, including Danger agent-guard enforcement, uses this metadata.
