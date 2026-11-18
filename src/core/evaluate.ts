/**
 * ReleaseGate verdict engine.
 *
 * Pure and deterministic: same input + same config => same verdict.
 * The verdict is severity-driven:
 *   - any blocker-severity evidence  => "no-go"
 *   - else any warning evidence      => "caution"
 *   - else                           => "go"
 * The 0-100 score is informational only (blocker -35, warning -10).
 *
 * Every finding carries citations (issue/PR/build refs) so the agent
 * never asserts a conclusion it cannot point at — that is the product's
 * core differentiator.
 */

import { resolveConfig, type ReleaseGateConfig } from './config.ts';
import type {
  EvidenceItem,
  FollowUp,
  IssueRef,
  LinkedIssue,
  ReleaseInput,
  ReleaseStats,
  VerdictResult,
} from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function isDone(issue: LinkedIssue): boolean {
  return issue.statusCategory === 'done';
}

function isOpenBlocker(issue: LinkedIssue): boolean {
  return !isDone(issue) && (issue.isBlockerPriority || issue.blocksRelease);
}

function refOf(issue: LinkedIssue): IssueRef {
  return { key: issue.key, summary: issue.summary, url: issue.url };
}

function ageInDays(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;
}

export function evaluateRelease(
  input: ReleaseInput,
  partialConfig?: Partial<ReleaseGateConfig>,
): VerdictResult {
  const cfg = resolveConfig(partialConfig);
  const evidence: EvidenceItem[] = [];
  const followUps: FollowUp[] = [];
  const releaseRef: IssueRef = {
    key: input.release.key,
    summary: input.release.summary,
    url: input.release.url,
  };

  const issues = input.linkedIssues;
  const doneIssues = issues.filter(isDone);
  const openIssues = issues.filter((i) => !isDone(i));
  const openBlockers = issues.filter(isOpenBlocker);
  const doneRatio = issues.length === 0 ? 0 : doneIssues.length / issues.length;

  // --- Rule: open blockers -------------------------------------------------
  for (const blocker of openBlockers) {
    const tolerated = openBlockers.length <= cfg.maxOpenBlockers;
    evidence.push({
      ruleId: 'open-blocker',
      severity: tolerated ? 'warning' : 'blocker',
      message:
        `Blocker ${blocker.key} is still open` +
        (blocker.blocksRelease ? ' and blocks this release' : '') +
        (tolerated ? ` (tolerated: ${openBlockers.length} <= maxOpenBlockers ${cfg.maxOpenBlockers})` : ''),
      refs: [refOf(blocker)],
    });
    followUps.push({
      title: `Resolve blocker ${blocker.key} before releasing ${input.release.key}`,
      reason: `Open blocker cited by ReleaseGate rule "open-blocker": ${blocker.summary}`,
      ruleId: 'open-blocker',
      relatedKey: blocker.key,
    });
  }

  // --- Rule: scope completeness (done ratio) --------------------------------
  if (issues.length === 0) {
    evidence.push({
      ruleId: 'no-linked-issues',
      severity: 'warning',
      message:
        'No linked issues or fix-version issues were found for this release, ' +
        'so scope completeness cannot be verified.',
      refs: [releaseRef],
    });
  } else if (doneRatio < cfg.doneRatioBlockerBelow) {
    evidence.push({
      ruleId: 'scope-incomplete',
      severity: 'blocker',
      message:
        `Only ${doneIssues.length}/${issues.length} issues (${Math.round(doneRatio * 100)}%) are done, ` +
        `below the releasable floor of ${Math.round(cfg.doneRatioBlockerBelow * 100)}%.`,
      refs: openIssues.slice(0, 10).map(refOf),
    });
  } else if (doneRatio < cfg.doneRatioWarningBelow) {
    evidence.push({
      ruleId: 'scope-incomplete',
      severity: 'warning',
      message:
        `${doneIssues.length}/${issues.length} issues (${Math.round(doneRatio * 100)}%) are done; ` +
        `${openIssues.length} still open.`,
      refs: openIssues.slice(0, 10).map(refOf),
    });
  }

  // --- Rule: stale issues ----------------------------------------------------
  for (const issue of openIssues) {
    const idle = ageInDays(issue.updatedAt, input.evaluatedAt);
    if (idle > cfg.staleDays) {
      evidence.push({
        ruleId: 'stale-issue',
        severity: 'warning',
        message: `${issue.key} has not been updated for ${Math.floor(idle)} days (stale threshold: ${cfg.staleDays}).`,
        refs: [refOf(issue)],
      });
      followUps.push({
        title: `Chase stale issue ${issue.key} (${Math.floor(idle)} days without update)`,
        reason: `Cited by ReleaseGate rule "stale-issue" for release ${input.release.key}.`,
        ruleId: 'stale-issue',
        relatedKey: issue.key,
      });
    }
  }

  // --- Rule: overdue issues --------------------------------------------------
  for (const issue of openIssues) {
    if (issue.dueDate && Date.parse(issue.dueDate) < Date.parse(input.evaluatedAt)) {
      evidence.push({
        ruleId: 'overdue-issue',
        severity: 'warning',
        message: `${issue.key} was due ${issue.dueDate.slice(0, 10)} and is still open.`,
        refs: [refOf(issue)],
      });
    }
  }

  // --- Rules: pull requests ---------------------------------------------------
  const unmerged = input.pullRequests.filter((pr) => pr.state !== 'merged');
  const declined = input.pullRequests.filter((pr) => pr.state === 'declined');
  const openPrs = input.pullRequests.filter((pr) => pr.state === 'open');

  for (const pr of declined) {
    evidence.push({
      ruleId: 'declined-pr',
      severity: 'blocker',
      message: `Pull request "${pr.title}" was declined and its change is not in the release.`,
      refs: [{ key: pr.id, summary: pr.title, url: pr.url }],
    });
    followUps.push({
      title: `Decide on declined PR ${pr.id}: rework or drop from ${input.release.key} scope`,
      reason: `Cited by ReleaseGate rule "declined-pr": ${pr.title}`,
      ruleId: 'declined-pr',
      relatedKey: pr.issueKey,
    });
  }

  if (openPrs.length > 0) {
    const escalated = openPrs.length > cfg.maxUnmergedPrs;
    evidence.push({
      ruleId: 'unmerged-pr',
      severity: escalated ? 'blocker' : 'warning',
      message:
        `${openPrs.length} pull request(s) are still open` +
        (escalated ? `, exceeding maxUnmergedPrs ${cfg.maxUnmergedPrs}` : ' (within tolerance)') +
        ': ' +
        openPrs.map((pr) => pr.id).join(', ') +
        '.',
      refs: openPrs.map((pr) => ({ key: pr.id, summary: pr.title, url: pr.url })),
    });
    for (const pr of openPrs) {
      followUps.push({
        title: `Merge or defer open PR ${pr.id} for ${input.release.key}`,
        reason: `Cited by ReleaseGate rule "unmerged-pr": ${pr.title}`,
        ruleId: 'unmerged-pr',
        relatedKey: pr.issueKey,
      });
    }
  }

  // --- Rules: builds ------------------------------------------------------------
  if (input.builds.length === 0) {
    evidence.push({
      ruleId: 'no-build-evidence',
      severity: 'warning',
      message: 'No build result is available for this release, so build health cannot be verified.',
      refs: [releaseRef],
    });
  } else {
    for (const build of input.builds) {
      if (build.state === 'failed') {
        evidence.push({
          ruleId: 'build-failed',
          severity: cfg.requireSuccessfulBuild ? 'blocker' : 'warning',
          message: `Build "${build.name}" failed.`,
          refs: [{ key: build.name, summary: `Build ${build.name}`, url: build.url }],
        });
        followUps.push({
          title: `Fix failing build "${build.name}" for ${input.release.key}`,
          reason: 'Cited by ReleaseGate rule "build-failed".',
          ruleId: 'build-failed',
        });
      } else if (build.state === 'in-progress' || build.state === 'unknown') {
        evidence.push({
          ruleId: 'build-unverified',
          severity: 'warning',
          message: `Build "${build.name}" has no conclusive result yet (state: ${build.state}).`,
          refs: [{ key: build.name, summary: `Build ${build.name}`, url: build.url }],
        });
      }
    }
  }

  // --- Verdict ------------------------------------------------------------------
  const blockers = evidence.filter((e) => e.severity === 'blocker');
  const warnings = evidence.filter((e) => e.severity === 'warning');
  const verdict = blockers.length > 0 ? 'no-go' : warnings.length > 0 ? 'caution' : 'go';
  const score = Math.max(0, 100 - 35 * blockers.length - 10 * warnings.length);

  const stats: ReleaseStats = {
    totalIssues: issues.length,
    doneIssues: doneIssues.length,
    doneRatio,
    openBlockers: openBlockers.length,
    unmergedPrs: unmerged.length,
    buildsChecked: input.builds.length,
  };

  const headline =
    verdict === 'go'
      ? `GO — ${input.release.key} is clear to release (score ${score}/100).`
      : verdict === 'caution'
        ? `CAUTION — ${input.release.key} can release only with ${warnings.length} known risk(s) (score ${score}/100).`
        : `NO-GO — ${input.release.key} is blocked by ${blockers.length} blocker finding(s) (score ${score}/100).`;

  return { verdict, score, headline, stats, evidence, followUps };
}
