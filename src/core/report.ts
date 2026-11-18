/**
 * Rendering of a VerdictResult into human/agent readable forms:
 *  - renderText: plain-text/markdown report (agent replies, CLI demo, logs)
 *  - toAdf:      Atlassian Document Format object for posting the verdict
 *                as a Jira comment via the REST API (body must be ADF).
 */

import type { ReleaseInput, VerdictResult } from './types.ts';

const VERDICT_LABEL: Record<VerdictResult['verdict'], string> = {
  go: 'GO',
  caution: 'CAUTION',
  'no-go': 'NO-GO',
};

export function renderText(input: ReleaseInput, result: VerdictResult): string {
  const lines: string[] = [];
  lines.push(`ReleaseGate verdict for ${input.release.key} (${input.release.summary})`);
  lines.push(`Verdict: ${VERDICT_LABEL[result.verdict]} — score ${result.score}/100`);
  lines.push(
    `Scope: ${result.stats.doneIssues}/${result.stats.totalIssues} issues done` +
      ` | open blockers: ${result.stats.openBlockers}` +
      ` | unmerged PRs: ${result.stats.unmergedPrs}` +
      ` | builds checked: ${result.stats.buildsChecked}`,
  );
  lines.push('');
  if (result.evidence.length === 0) {
    lines.push('Evidence: no findings. All checks passed with citations on file.');
  } else {
    lines.push('Evidence:');
    for (const item of result.evidence) {
      const refs = item.refs.map((r) => `${r.key} (${r.url})`).join(', ');
      lines.push(`- [${item.severity.toUpperCase()}] (${item.ruleId}) ${item.message} — refs: ${refs}`);
    }
  }
  if (result.followUps.length > 0) {
    lines.push('');
    lines.push('Suggested follow-up subtasks:');
    for (const f of result.followUps) {
      lines.push(`- ${f.title}`);
    }
  }
  return lines.join('\n');
}

type AdfNode = { type: string; attrs?: Record<string, unknown>; content?: AdfNode[]; text?: string };

function textNode(text: string): AdfNode {
  return { type: 'text', text };
}

function paragraph(text: string): AdfNode {
  return { type: 'paragraph', content: [textNode(text)] };
}

function bulletItem(text: string): AdfNode {
  return { type: 'listItem', content: [paragraph(text)] };
}

/**
 * Build an ADF document for the verdict comment. Kept intentionally to
 * the stable ADF node subset (doc/paragraph/bulletList/listItem/text)
 * that the Jira REST v3 comment API accepts.
 */
export function toAdf(input: ReleaseInput, result: VerdictResult): Record<string, unknown> {
  const content: AdfNode[] = [
    paragraph(`ReleaseGate verdict for ${input.release.key}: ${VERDICT_LABEL[result.verdict]} (score ${result.score}/100)`),
    paragraph(
      `Scope: ${result.stats.doneIssues}/${result.stats.totalIssues} issues done; ` +
        `open blockers: ${result.stats.openBlockers}; unmerged PRs: ${result.stats.unmergedPrs}; ` +
        `builds checked: ${result.stats.buildsChecked}.`,
    ),
  ];

  if (result.evidence.length > 0) {
    content.push(paragraph('Evidence:'));
    content.push({
      type: 'bulletList',
      content: result.evidence.map((item) =>
        bulletItem(
          `[${item.severity.toUpperCase()}] ${item.message} Refs: ${item.refs.map((r) => r.key).join(', ')}`,
        ),
      ),
    });
  } else {
    content.push(paragraph('No findings: every check passed.'));
  }

  if (result.followUps.length > 0) {
    content.push(paragraph('Suggested follow-ups:'));
    content.push({
      type: 'bulletList',
      content: result.followUps.map((f) => bulletItem(f.title)),
    });
  }

  return { type: 'doc', version: 1, content };
}
