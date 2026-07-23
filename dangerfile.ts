import { execFileSync } from 'node:child_process';
import { matchesGlob } from 'node:path';
import { danger, fail, schedule, warn } from 'danger';

const PROTECTED_PATHS = [
  'README.md',
  'LICENSE',
  'CLAUDE.md',
  'assets/**',
  '.claude/**',
  '.codex/**',
  '.cursor/**',
] as const;

const POLICY_FILES = [
  'dangerfile.ts',
  '.github/workflows/danger.yml',
] as const;

const AGENT_GUARD_OFF = 'agent-guard:off';
const AGENT_GUARD_ON = 'agent-guard:on';
const agentPattern =
  /(^|[^a-z0-9])(agent|aider|claude|cline|codex|copilot|cursor|cursoragent|devin|gemini|jules|windsurf)([^a-z0-9]|$)|@(anthropic|cursor|openai)\.com/i;
const markerPattern =
  /^\s*(?:\/\/|#|--|;|\/\*+|\*|<!--)\s*agent-guard:(off|on)\s*(?:\*\/|-->)?\s*$/i;

interface AgentCommit {
  author: {
    name: string;
    email: string;
  };
  message: string;
}

type ChangedLine =
  | {
      type: 'add';
      ln: number;
      content: string;
    }
  | {
      type: 'del';
      ln: number;
      content: string;
    }
  | {
      type: 'normal';
      ln1: number;
      ln2: number;
      content: string;
    };

interface InlineGuardError {
  line: number;
  message: string;
}

interface ParsedInlineGuards {
  errors: InlineGuardError[];
  markerLines: Set<number>;
  protectedLines: Set<number>;
}

interface ProtectedChange {
  line: number;
  side: 'base' | 'head';
}

interface InspectInlineGuardsOptions {
  after: string;
  before: string;
  changes: ChangedLine[];
  deleted: boolean;
}

const changedFiles = [
  ...new Set([
    ...danger.git.created_files,
    ...danger.git.modified_files,
    ...danger.git.deleted_files,
  ]),
];

function isAgentAuthored(
  commits: readonly AgentCommit[],
  pullRequestAuthor: string
): boolean {
  const identities = [
    pullRequestAuthor,
    ...commits.flatMap(({ author, message }) => [
      author.name,
      author.email,
      ...message
        .split(/\r?\n/)
        .filter((line) => /^co-authored-by:/i.test(line.trim())),
    ]),
  ];

  return identities.some((identity) => agentPattern.test(identity));
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some((pattern) => matchesGlob(path, pattern));
}

function parseInlineGuards(content: string): ParsedInlineGuards {
  const errors: InlineGuardError[] = [];
  const markerLines = new Set<number>();
  const protectedLines = new Set<number>();
  let guardStart: number | undefined;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const marker = line.match(markerPattern)?.[1]?.toLowerCase();

    if (marker === 'off') {
      markerLines.add(lineNumber);
      if (guardStart !== undefined) {
        errors.push({
          line: lineNumber,
          message: `${AGENT_GUARD_OFF} cannot be nested; the current region starts on line ${guardStart}.`,
        });
      } else {
        guardStart = lineNumber;
      }
      continue;
    }

    if (marker === 'on') {
      markerLines.add(lineNumber);
      if (guardStart === undefined) {
        errors.push({
          line: lineNumber,
          message: `${AGENT_GUARD_ON} has no matching ${AGENT_GUARD_OFF}.`,
        });
      } else {
        guardStart = undefined;
      }
      continue;
    }

    if (guardStart !== undefined) {
      protectedLines.add(lineNumber);
    }
  }

  if (guardStart !== undefined) {
    errors.push({
      line: guardStart,
      message: `${AGENT_GUARD_OFF} has no matching ${AGENT_GUARD_ON}.`,
    });
  }

  return { errors, markerLines, protectedLines };
}

function inspectInlineGuards({
  after,
  before,
  changes,
  deleted,
}: InspectInlineGuardsOptions): {
  errors: InlineGuardError[];
  policyChanged: boolean;
  protectedChanges: ProtectedChange[];
  relaxedChanges: ProtectedChange[];
} {
  const baseGuards = parseInlineGuards(before);
  const headGuards = parseInlineGuards(after);
  const addedLines = changes.filter(
    (change): change is Extract<ChangedLine, { type: 'add' }> =>
      change.type === 'add'
  );
  const deletedLines = changes.filter(
    (change): change is Extract<ChangedLine, { type: 'del' }> =>
      change.type === 'del'
  );
  const addedMarker = addedLines.some(({ ln }) =>
    headGuards.markerLines.has(ln)
  );
  const removedMarker = deletedLines.some(({ ln }) =>
    baseGuards.markerLines.has(ln)
  );
  const headProtectedChanges: ProtectedChange[] = addedLines
    .filter(({ ln }) => headGuards.protectedLines.has(ln))
    .map(({ ln }) => ({ line: ln, side: 'head' }));
  const baseProtectedChanges: ProtectedChange[] = deletedLines
    .filter(({ ln }) => baseGuards.protectedLines.has(ln))
    .map(({ ln }) => ({ line: ln, side: 'base' }));
  const protectionWasRelaxed = removedMarker && !deleted;

  return {
    errors: headGuards.errors,
    policyChanged: addedMarker || removedMarker,
    protectedChanges: [
      ...headProtectedChanges,
      ...(protectionWasRelaxed ? [] : baseProtectedChanges),
    ],
    relaxedChanges: protectionWasRelaxed ? baseProtectedChanges : [],
  };
}

function fileAtRevision(revision: string, path: string): string {
  try {
    return execFileSync('git', ['show', `${revision}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 25 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

schedule(
  (async () => {
    if (!isAgentAuthored(danger.git.commits, danger.github.pr.user.login)) {
      return;
    }

    const changedPolicyFiles = changedFiles.filter((path) =>
      POLICY_FILES.includes(path as (typeof POLICY_FILES)[number])
    );
    if (changedPolicyFiles.length > 0) {
      warn(
        `Agent guard policy changed in ${changedPolicyFiles
          .map((path) => `\`${path}\``)
          .join(', ')}. Review this policy change explicitly.`
      );
    }

    for (const path of changedFiles) {
      if (isProtectedPath(path)) {
        fail(
          `Agent-authored changes may not modify protected path \`${path}\`. Relax \`PROTECTED_PATHS\` in a separately reviewed policy change if this edit is intentional.`,
          path
        );
        continue;
      }

      const diff = await danger.git.structuredDiffForFile(path);
      if (diff === null) {
        continue;
      }

      const before = fileAtRevision(danger.git.base, path);
      const after = fileAtRevision(danger.git.head, path);
      if (before.includes('\0') || after.includes('\0')) {
        continue;
      }

      const result = inspectInlineGuards({
        before,
        after,
        changes: diff.chunks.flatMap(
          ({ changes }) => changes as ChangedLine[]
        ),
        deleted: danger.git.deleted_files.includes(path),
      });

      if (result.errors.length > 0) {
        const [error] = result.errors;
        fail(`Invalid inline agent guard: ${error.message}`, path, error.line);
      }

      if (result.protectedChanges.length > 0) {
        const [firstChange] = result.protectedChanges;
        const changedLineCount = result.protectedChanges.length;
        fail(
          `Agent-authored changes touch ${changedLineCount} protected ${
            changedLineCount === 1 ? 'line' : 'lines'
          } between \`agent-guard:off\` and \`agent-guard:on\`.`,
          path,
          firstChange.side === 'head' ? firstChange.line : undefined
        );
      }

      if (result.policyChanged) {
        const relaxation =
          result.relaxedChanges.length > 0
            ? ` This also exposes ${result.relaxedChanges.length} previously protected ${
                result.relaxedChanges.length === 1 ? 'line' : 'lines'
              }.`
            : '';
        warn(
          `Inline agent guard markers changed in \`${path}\`. Review this policy change explicitly.${relaxation}`
        );
      }
    }
  })()
);
