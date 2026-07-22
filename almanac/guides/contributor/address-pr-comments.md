---
title: "Address PR Comments"
summary: "Address PR comments is the workflow for fetching, deduplicating, triaging, and validating review feedback on the current branch."
topics: [guides, contributor-workflow, pr-review]
sources:
  - id: claude-comments
    type: file
    path: .claude/commands/address-pr-comments.md
  - id: codex-comments
    type: file
    path: .codex/skills/address-pr-comments/SKILL.md
---

# Address PR Comments

Address PR comments when the current branch has review feedback that must be fixed, declined with a reason, or surfaced to the user. The workflow locates the current branch's GitHub PR, fetches both issue comments and inline review comments, deduplicates actionable feedback, checks each cited location against the current `HEAD`, applies the smallest correct fix when possible, reruns package validation after any fix, and reports every unresolved comment in a table [@claude-comments] [@codex-comments]. This guide is normally reached from [Run Checks](run-checks) and belongs to the broader [Contributor Automation](../../architecture/automation/contributor-automation) flow.

## Locate The Pull Request

Start by asking GitHub for the PR attached to the current branch [@claude-comments] [@codex-comments].

```bash
gh pr view --json number,url,headRefName,state
```

If no PR exists for the current branch, report `no PR found for current branch` and stop [@claude-comments] [@codex-comments]. If `gh auth status` fails, surface the authentication error and stop because the workflow requires authenticated GitHub API access [@claude-comments] [@codex-comments].

## Fetch Both Comment Streams

Fetch top-level issue comments and inline pull-request comments. Both endpoints are required because Greptile's summary can appear on issue comments while inline findings appear on pull request review comments [@claude-comments] [@codex-comments].

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate
```

Use `gh repo view --json nameWithOwner` or `git remote get-url origin` to resolve `{owner}/{repo}`, and use the PR number from the first step for `{number}` [@claude-comments] [@codex-comments].

## Dedupe And Filter Feedback

Group comments by `(path, line, author, body-hash)`, keeping only the most recent comment when the body collides [@claude-comments] [@codex-comments]. Keep distinct comments on the same line when their bodies differ, because a high-priority and a lower-priority finding can both point to the same code [@codex-comments].

Discard deploy-bot comments such as Vercel or GitHub Actions noise [@claude-comments] [@codex-comments]. Discard comments authored by the current user only when they are not feedback to act on; keep self-authored comments that contain an explicit instruction or correction directed at the AI [@claude-comments] [@codex-comments]. Skip GitHub-resolved threads unless the user explicitly asks to revisit them [@claude-comments] [@codex-comments].

## Triage Each Remaining Comment

Open the file at the cited path and line, using `line` or `original_line` when a review comment's line moved, and confirm that the issue still exists at the current `HEAD` [@claude-comments] [@codex-comments]. Compare a comment's `commit_id` with branch history when needed, because feedback on an older commit may already be fixed by a later commit [@claude-comments] [@codex-comments].

For each unresolved comment, choose one action:

- **Fix:** apply the smallest correct change. If the suggested patch is right, use it; if a different change is more correct, make that change and explain why [@claude-comments] [@codex-comments].
- **Decline:** if the finding is wrong, obsolete at current `HEAD`, or purely informational, leave the code unchanged and write a one-line reason [@claude-comments] [@codex-comments].
- **Defer to user:** if the comment needs context or a design decision the agent does not have, stop on that comment and surface it to the user [@claude-comments] [@codex-comments].

## Validate And Report

After applying any fixes, rerun `npm run typecheck`, `npm test`, and `npm run build` [@claude-comments] [@codex-comments]. Do not invoke the full [Run Checks](run-checks) flow from inside this workflow because that flow calls comment handling and would loop [@claude-comments] [@codex-comments].

Report the result as a per-comment table with `File`, `Line`, `Author`, `Severity`, `Action`, and `Reason` columns [@claude-comments] [@codex-comments]. Greptile severity badges are encoded in comment bodies as image alt values such as `P0`, `P1`, and `P2`, so parse those values into the severity column when present [@claude-comments] [@codex-comments]. End with a short recommendation on whether to commit the changes or wait for user review [@claude-comments] [@codex-comments].
