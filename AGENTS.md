# Working in this repo

This is an experimental, pre-release product repo. Do not worry about things like
backwards compatibility, migrating functionality for existing users, etc.

## Infrastructure

[almanac/README.md](./almanac/README.md)

## General Guidance

Before editing files, read `.agentsignore` and never modify any files at paths 
matched by its gitignore-style patterns.

Run `npm run typecheck`, `npm test`, and `npm run build` before changing shared
infrastructure.

Use gitmoji in commit messages and PR titles.

Every coding agent that writes code for a pull request must identify itself in
the pull request's commit history. Use the agent as the commit author or add a
`Co-authored-by: Agent Name <agent-email>` trailer to at least one commit. The
name must clearly identify the agent with an automation marker such as `Agent`,
`Bot`, or `Automation`, or with an unambiguous product identity such as
`Amazon Q`; examples include `Codex Agent`, `Claude Agent`, and `Cursor Agent`.
Agent-only CI, including `.agentsignore` enforcement, uses this metadata.
