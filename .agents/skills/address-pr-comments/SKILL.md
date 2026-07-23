---
name: address-pr-comments
description: Fetch open review comments on the current branch's PR (Greptile, human reviewers, etc.) and remediate each one — either by fixing the code, explaining why the comment does not apply, or flagging it for the user. Use when asked to "address PR comments", "fix Greptile findings", or whenever the `check-changed-folders` skill detects unresolved review feedback on the PR for the current branch.
---

# Address PR Comments

Pull review comments off the current branch's GitHub PR, dedupe them against the current `HEAD`, and apply or decline each one with a written reason.

## Workflow

1. Locate the PR for the current branch:

```bash
gh pr view --json number,url,headRefName,state
```

If no PR exists for the current branch, report `no PR found for current branch` and stop.

2. Fetch both top-level (issue) comments and inline review comments:

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate
gh api repos/{owner}/{repo}/pulls/{number}/comments  --paginate
```

`{owner}/{repo}` is available from `gh repo view --json nameWithOwner` or from `git remote get-url origin`.
`{number}` comes from step 1.
Both endpoints are required — Greptile's top-level summary lives on `issues/{number}/comments`, while its inline findings live on `pulls/{number}/comments`.

3. Group and de-duplicate:

- Dedupe by `(path, line, author, body-hash)` — re-runs of the same finding share a body so they collapse, but distinct findings on the same line (e.g. a P1 and a P2 on the same line) have different bodies and both survive.
  When a body collides, keep only the most recent.
- Discard comments authored by the current user only if they are not feedback to act on (the user's own clarifying replies or self-reviews are not directives; keep them if they contain an explicit instruction or correction directed at the AI).
- Discard comments from deploy bots: `vercel`, `github-actions`, etc.
- If a comment thread is resolved on GitHub, skip it unless the user explicitly asks otherwise.

4. Read the code at each cited location.
   Open the file at `path:line` and confirm the issue is still present at the current `HEAD`.
   A previous commit on this branch may have already fixed it.

5. For each unresolved comment, choose one of three actions and record which:

- **Fix:** apply the smallest correct change.
  If the comment suggests a patch and you agree with it, follow it; if a smaller or different fix is more correct, do that and explain why in your report.
- **Decline:** if the comment is wrong, doesn't apply at the current `HEAD`, or is purely informational ("note, not a defect"), skip the change and write a one-line reason.
- **Defer to user:** if the comment requires a judgement call, design decision, or context you don't have, do not guess — surface it in the report and stop on that comment.

6. Re-run validation.
   After applying any fixes, re-run the package checks — `npm run typecheck`, `npm test`, `npm run build`.
   Do **not** invoke the `check-changed-folders` skill from here: that skill calls this one, and re-entering it would loop.
   Do not commit if any check fails.

7. Report.
   Produce a per-comment table with these columns:

| File | Line | Author | Severity | Action | Reason |

End with a short recommendation on whether to commit the changes now or wait for user review.

## Notes

- The `gh` CLI must be authenticated for the current repo.
  If `gh auth status` fails, surface the error and stop.
- Inline comment objects include `path`, `line` (or `original_line` if the line moved since the comment), `commit_id`, and `body`.
  Use the path and the most recent `line` value.
- Greptile severity badges are encoded as `<img alt="P0">`, `<img alt="P1">`, `<img alt="P2">` inside the comment body.
  Parse those out for the severity column.
- Compare a comment's `commit_id` against `git log` to detect comments that were left on an older commit and may already have been addressed by a later commit on the same branch.
