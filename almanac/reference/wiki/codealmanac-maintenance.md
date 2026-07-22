---
title: "CodeAlmanac Maintenance"
summary: "This reference records Rudder's local CodeAlmanac maintenance mode: scheduled sync and garden are enabled, auto-commit is allowed for wiki source changes, and package update automation remains disabled."
topics: [reference, wiki, automation]
sources:
  - id: automation-session
    type: conversation
    path: /Users/vivek/.codex/sessions/2026/07/22/rollout-2026-07-22T11-37-04-019f8a79-2786-7200-bc5f-4d94980ab0fc.jsonl
    title: "CodeAlmanac automation setup transcript"
  - id: ingest-manual
    type: manual
    path: ingest.md
    title: "Ingest manual"
  - id: garden-manual
    type: manual
    path: garden.md
    title: "Garden manual"
  - id: sources-manual
    type: manual
    path: sources.md
    title: "Sources manual"
---

CodeAlmanac maintenance for Rudder is configured as a local scheduled workflow, not a per-PR documentation requirement. As of July 22, 2026, transcript sync and garden automation are enabled, package update automation is disabled, telemetry is disabled, and `auto_commit` is enabled so CodeAlmanac may commit its own wiki-source changes [@automation-session]. Because this is user-scoped runtime configuration, verify the live state with `codealmanac config list` and `codealmanac automation status` before depending on it [@automation-session]. For broader repository routing, use [Getting Started](../../getting-started).

## Scheduled Jobs

Transcript sync is enabled with `automation.sync.every` set to `5h`. The setup run installed and loaded `/Users/vivek/Library/LaunchAgents/com.codealmanac.sync.plist`, and its first reported run succeeded [@automation-session].

Garden is enabled with `automation.garden.every` set to `24h`. The setup run installed and loaded `/Users/vivek/Library/LaunchAgents/com.codealmanac.garden.plist`, and its first reported run succeeded [@automation-session].

Update automation remains disabled even though the update interval setting exists at `24h`. The setup run reported `update automation: not installed`, so scheduled CLI package updates are outside the current maintenance mode [@automation-session].

## Commit Boundary

The user allowed CodeAlmanac to create its own commits for the repository knowledge base, after which `codealmanac config set auto_commit true` succeeded [@automation-session]. Treat that permission as scoped to wiki-source maintenance under `almanac/`; the automation setup did not authorize unrelated repository commits [@automation-session].

When reviewing automated work, inspect `almanac/**/*.md` and `almanac/topics.yaml`, then run `codealmanac validate`. The Ingest manual allows a no-op when selected material adds no durable wiki knowledge, Garden defines graph cleanup work, and Sources treats transcripts, PRs, and diffs as raw material rather than automatic wiki content [@ingest-manual] [@garden-manual] [@sources-manual].

## Useful Commands

| Task | Command |
| --- | --- |
| Check local configuration | `codealmanac config list` |
| Check scheduled job installation and results | `codealmanac automation status` |
| Inspect recent maintenance jobs | `codealmanac jobs --limit 8` |
| Attach to a running job | `codealmanac jobs attach <run-id>` |
| Validate wiki source after edits | `codealmanac validate` |
