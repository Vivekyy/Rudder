Fetch open review comments on the current branch's PR (Greptile, human reviewers, etc.) and remediate each one — either by fixing the code, explaining why the comment does not apply, or flagging it for the user.

## Steps

1. **Locate the PR for the current branch.** Use `gh pr view --json number,url,headRefName,state`. If no PR exists for the current branch, report `no PR found for current branch` and stop.

2. **Fetch comments.** Run both of:

   ```bash
   gh api repos/{owner}/{repo}/issues/{number}/comments --paginate   # top-level + Greptile summary
   gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate    # inline review comments
   ```

   The repo `{owner}/{repo}` is available from `gh repo view --json nameWithOwner` or from `git remote get-url origin`. The `{number}` comes from step 1. Both endpoints are required — Greptile's top-level summary lives on `issues/{number}/comments`, while its inline findings live on `pulls/{number}/comments`.

3. **Group and de-duplicate.** Dedupe by `(path, line, author, body-hash)` — re-runs of the same finding share a body so they collapse, but distinct findings on the same line (e.g. a P1 and a P2) have different bodies and both survive. When a body collides, keep only the most recent. Discard comments authored by the current user only if they are not feedback to act on (clarifying replies/self-reviews are not directives; keep them if they contain an explicit instruction to the AI). Discard deploy-bot comments (`vercel`, `github-actions`, etc.). Skip comment threads already resolved on GitHub unless the user asks otherwise.

4. **Read the code at each cited location.** Open the file at `path:line` and confirm the issue is still present at the current `HEAD` — a previous commit on this branch may have already fixed it.

5. **For each unresolved comment, take one of three actions and record which:**

   - **Fix:** apply the smallest correct change. If the comment suggests a patch and you agree, follow it; if a smaller or different fix is more correct, do that and explain why.
   - **Decline:** if the comment is wrong, doesn't apply at the current `HEAD`, or is purely informational, skip it and write a one-line reason.
   - **Defer to user:** if the comment needs a judgement call or context you don't have, do not guess — surface it in the report and stop on that comment.

6. **Re-run validation.** After applying any fixes, re-run the package checks — `npm run typecheck`, `npm test`, `npm run build`. Do **not** invoke the full `/check` flow from here (it calls this one, and re-entering would loop). Do not commit if any check fails.

7. **Report.** Produce a per-comment table:

   | File | Line | Author | Severity | Action | Reason |

   End with a short recommendation on whether to commit now or wait for user review.

## Notes

- The `gh` CLI must be authenticated for the current repo. If `gh auth status` fails, surface the error and stop.
- Inline comment objects include `path`, `line` (or `original_line` if the line moved), `commit_id`, and `body`. Use the path and the most recent `line` value.
- Greptile severity badges are encoded as `<img alt="P0">`, `<img alt="P1">`, `<img alt="P2">` inside the comment body. Parse those out for the severity column.
- Compare a comment's `commit_id` against `git log` to detect comments left on an older commit that may already be addressed.
