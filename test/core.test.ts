/**
 * Unit tests for the ReleaseGate verdict engine (pure core layer).
 * Run: npm test   (node --test, no third-party test framework)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.ts';
import { evaluateRelease } from '../src/core/evaluate.ts';
import { renderText, toAdf } from '../src/core/report.ts';
import type { LinkedIssue, ReleaseInput } from '../src/core/types.ts';
import { doomedRelease, healthyRelease } from '../src/demo/fixtures.ts';

const NOW = '2026-11-19T09:00:00.000Z';
const BASE = 'https://example.atlassian.net/browse/';

function issue(partial: Partial<LinkedIssue> & { key: string }): LinkedIssue {
  return {
    summary: `Summary of ${partial.key}`,
    url: `${BASE}${partial.key}`,
    statusCategory: 'done',
    isBlockerPriority: false,
    blocksRelease: false,
    updatedAt: '2026-11-18T09:00:00.000Z',
    ...partial,
  };
}

function input(partial: Partial<ReleaseInput>): ReleaseInput {
  return {
    release: { key: 'REL-1', summary: 'Test release', url: `${BASE}REL-1` },
    linkedIssues: [issue({ key: 'A-1' })],
    pullRequests: [],
    builds: [{ name: 'ci #1', state: 'successful', url: 'https://ci.example.org/1' }],
    evaluatedAt: NOW,
    ...partial,
  };
}

describe('verdict: go', () => {
  it('healthy fixture release is GO with score 100 and no evidence', () => {
    const r = evaluateRelease(healthyRelease);
    assert.equal(r.verdict, 'go');
    assert.equal(r.score, 100);
    assert.equal(r.evidence.length, 0);
    assert.equal(r.followUps.length, 0);
    assert.equal(r.stats.doneRatio, 1);
  });

  it('a done blocker-priority issue does not block', () => {
    const r = evaluateRelease(input({ linkedIssues: [issue({ key: 'A-1', isBlockerPriority: true })] }));
    assert.equal(r.verdict, 'go');
  });
});

describe('verdict: no-go drivers', () => {
  it('open blocker-priority issue => no-go with citation', () => {
    const r = evaluateRelease(
      input({
        linkedIssues: [
          issue({ key: 'A-1' }),
          issue({ key: 'A-2', statusCategory: 'in-progress', isBlockerPriority: true }),
        ],
      }),
    );
    assert.equal(r.verdict, 'no-go');
    const ev = r.evidence.find((e) => e.ruleId === 'open-blocker');
    assert.ok(ev);
    assert.equal(ev.severity, 'blocker');
    assert.deepEqual(ev.refs.map((x) => x.key), ['A-2']);
    assert.ok(r.followUps.some((f) => f.relatedKey === 'A-2'));
  });

  it('issue that blocks the release via link => no-go even without blocker priority', () => {
    const r = evaluateRelease(
      input({
        linkedIssues: [issue({ key: 'A-1' }), issue({ key: 'A-2', statusCategory: 'to-do', blocksRelease: true })],
      }),
    );
    assert.equal(r.verdict, 'no-go');
    assert.ok(r.evidence.some((e) => e.ruleId === 'open-blocker'));
  });

  it('blockers within maxOpenBlockers tolerance downgrade to caution', () => {
    const r = evaluateRelease(
      input({
        linkedIssues: [
          issue({ key: 'A-1' }),
          issue({ key: 'A-2' }),
          issue({ key: 'A-3' }),
          issue({ key: 'A-4' }),
          issue({ key: 'A-5', statusCategory: 'in-progress', isBlockerPriority: true }),
        ],
      }),
      { maxOpenBlockers: 1 },
    );
    assert.equal(r.verdict, 'caution');
    assert.equal(r.evidence.find((e) => e.ruleId === 'open-blocker')?.severity, 'warning');
  });

  it('done ratio below the hard floor => no-go', () => {
    const issues = [
      issue({ key: 'A-1' }),
      issue({ key: 'A-2', statusCategory: 'to-do' }),
      issue({ key: 'A-3', statusCategory: 'to-do' }),
      issue({ key: 'A-4', statusCategory: 'to-do' }),
    ]; // 25% done < 80% floor
    const r = evaluateRelease(input({ linkedIssues: issues }));
    assert.equal(r.verdict, 'no-go');
    assert.equal(r.evidence.find((e) => e.ruleId === 'scope-incomplete')?.severity, 'blocker');
  });

  it('declined PR => no-go', () => {
    const r = evaluateRelease(
      input({ pullRequests: [{ id: 'PR-1', title: 'risky change', url: 'https://bb/pr/1', state: 'declined' }] }),
    );
    assert.equal(r.verdict, 'no-go');
    assert.ok(r.evidence.some((e) => e.ruleId === 'declined-pr'));
  });

  it('open PRs beyond tolerance => no-go; within tolerance => caution', () => {
    const prs = [
      { id: 'PR-1', title: 'a', url: 'https://bb/pr/1', state: 'open' as const },
      { id: 'PR-2', title: 'b', url: 'https://bb/pr/2', state: 'open' as const },
    ];
    assert.equal(evaluateRelease(input({ pullRequests: prs })).verdict, 'no-go');
    assert.equal(evaluateRelease(input({ pullRequests: prs }), { maxUnmergedPrs: 2 }).verdict, 'caution');
  });

  it('failed build => no-go when builds are required, caution when not', () => {
    const builds = [{ name: 'ci #9', state: 'failed' as const, url: 'https://ci/9' }];
    assert.equal(evaluateRelease(input({ builds })).verdict, 'no-go');
    assert.equal(evaluateRelease(input({ builds }), { requireSuccessfulBuild: false }).verdict, 'caution');
  });
});

describe('verdict: caution drivers', () => {
  it('partially done scope (above floor) => caution', () => {
    const issues = [...Array(9)].map((_, i) => issue({ key: `A-${i + 1}` }));
    issues.push(issue({ key: 'A-10', statusCategory: 'in-progress' })); // 90% done
    const r = evaluateRelease(input({ linkedIssues: issues }));
    assert.equal(r.verdict, 'caution');
    assert.equal(r.evidence.find((e) => e.ruleId === 'scope-incomplete')?.severity, 'warning');
  });

  it('stale open issue => caution and a chase follow-up', () => {
    const r = evaluateRelease(
      input({
        linkedIssues: [
          issue({ key: 'A-1' }),
          issue({ key: 'A-2', statusCategory: 'in-progress', updatedAt: '2026-10-20T09:00:00.000Z' }),
        ],
      }),
    );
    // 50% done is below the 80% floor, so verdict is no-go; isolate stale rule via config:
    assert.ok(r.evidence.some((e) => e.ruleId === 'stale-issue'));
    const r2 = evaluateRelease(
      input({
        linkedIssues: [
          issue({ key: 'A-1' }),
          issue({ key: 'A-2' }),
          issue({ key: 'A-3' }),
          issue({ key: 'A-4' }),
          issue({ key: 'A-5', statusCategory: 'in-progress', updatedAt: '2026-10-20T09:00:00.000Z' }),
        ],
      }),
    );
    assert.equal(r2.verdict, 'caution');
    assert.ok(r2.followUps.some((f) => f.ruleId === 'stale-issue'));
  });

  it('overdue open issue => warning; overdue done issue => ignored', () => {
    const r = evaluateRelease(
      input({
        linkedIssues: [
          issue({ key: 'A-1' }),
          issue({ key: 'A-2' }),
          issue({ key: 'A-3' }),
          issue({ key: 'A-4' }),
          issue({ key: 'A-5', statusCategory: 'to-do', dueDate: '2026-11-01' }),
        ],
      }),
    );
    assert.ok(r.evidence.some((e) => e.ruleId === 'overdue-issue'));
    const r2 = evaluateRelease(input({ linkedIssues: [issue({ key: 'A-1', dueDate: '2026-11-01' })] }));
    assert.equal(r2.verdict, 'go');
  });

  it('no linked issues at all => caution (unverifiable scope), not go', () => {
    const r = evaluateRelease(input({ linkedIssues: [] }));
    assert.equal(r.verdict, 'caution');
    assert.ok(r.evidence.some((e) => e.ruleId === 'no-linked-issues'));
  });

  it('no build evidence => warning; in-progress build => warning', () => {
    assert.ok(evaluateRelease(input({ builds: [] })).evidence.some((e) => e.ruleId === 'no-build-evidence'));
    const r = evaluateRelease(input({ builds: [{ name: 'ci', state: 'in-progress', url: 'https://ci/1' }] }));
    assert.equal(r.verdict, 'caution');
    assert.ok(r.evidence.some((e) => e.ruleId === 'build-unverified'));
  });
});

describe('doomed fixture', () => {
  it('REL-102 is NO-GO and cites every planted problem', () => {
    const r = evaluateRelease(doomedRelease);
    assert.equal(r.verdict, 'no-go');
    const ruleIds = new Set(r.evidence.filter((e) => e.severity === 'blocker').map((e) => e.ruleId));
    assert.ok(ruleIds.has('open-blocker'));
    assert.ok(ruleIds.has('declined-pr'));
    assert.ok(ruleIds.has('build-failed'));
    assert.ok(r.evidence.some((e) => e.ruleId === 'stale-issue'));
    assert.ok(r.evidence.some((e) => e.ruleId === 'overdue-issue'));
    assert.ok(r.evidence.some((e) => e.ruleId === 'unmerged-pr'));
    assert.ok(r.followUps.length >= 4);
    assert.ok(r.score < 50);
  });
});

describe('config', () => {
  it('defaults match DEFAULT_CONFIG and partial overrides merge', () => {
    assert.deepEqual(resolveConfig(), DEFAULT_CONFIG);
    assert.equal(resolveConfig({ staleDays: 3 }).staleDays, 3);
    assert.equal(resolveConfig({ staleDays: 3 }).maxOpenBlockers, DEFAULT_CONFIG.maxOpenBlockers);
  });

  it('invalid configs throw', () => {
    assert.throws(() => resolveConfig({ maxOpenBlockers: -1 }));
    assert.throws(() => resolveConfig({ doneRatioWarningBelow: 1.5 }));
    assert.throws(() => resolveConfig({ doneRatioBlockerBelow: 0.9, doneRatioWarningBelow: 0.5 }));
    assert.throws(() => evaluateRelease(input({}), { staleDays: -2 }));
  });
});

describe('rendering', () => {
  it('text report contains verdict, score and citations', () => {
    const text = renderText(doomedRelease, evaluateRelease(doomedRelease));
    assert.match(text, /NO-GO/);
    assert.match(text, /PAY-26/);
    assert.match(text, /Evidence:/);
  });

  it('ADF output is a doc v1 with paragraphs and bullet lists', () => {
    const adf = toAdf(doomedRelease, evaluateRelease(doomedRelease)) as {
      type: string;
      version: number;
      content: { type: string }[];
    };
    assert.equal(adf.type, 'doc');
    assert.equal(adf.version, 1);
    assert.ok(adf.content.some((n) => n.type === 'bulletList'));
    assert.ok(adf.content.some((n) => n.type === 'paragraph'));
  });
});
