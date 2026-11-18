/**
 * ReleaseGate core types.
 *
 * This layer is deliberately platform-agnostic: it knows nothing about
 * Jira REST payloads, Forge, or Rovo. The Forge layer (src/forge) maps
 * Jira data into these shapes, and everything here is a pure function
 * of its inputs so the verdict logic can be unit-tested offline.
 */

export type StatusCategory = 'done' | 'in-progress' | 'to-do';

export interface IssueRef {
  key: string;
  summary: string;
  /** Canonical browse URL, used as the evidence citation link. */
  url: string;
}

export interface LinkedIssue extends IssueRef {
  statusCategory: StatusCategory;
  /** Issue carries a blocker-level priority (e.g. Jira priority "Blocker"). */
  isBlockerPriority: boolean;
  /** This issue blocks the release issue (Jira "blocks" link, inward direction). */
  blocksRelease: boolean;
  /** ISO date (yyyy-mm-dd) or timestamp; optional. */
  dueDate?: string;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

export type PullRequestState = 'open' | 'merged' | 'declined';

export interface PullRequest {
  id: string;
  title: string;
  url: string;
  state: PullRequestState;
  /** Key of the Jira issue the PR is associated with, when known. */
  issueKey?: string;
}

export type BuildState = 'successful' | 'failed' | 'in-progress' | 'unknown';

export interface BuildResult {
  name: string;
  state: BuildState;
  url: string;
  finishedAt?: string;
}

export interface ReleaseInput {
  release: IssueRef & { fixVersion?: string };
  linkedIssues: LinkedIssue[];
  pullRequests: PullRequest[];
  builds: BuildResult[];
  /** ISO timestamp the evaluation is performed "as of" (injected for determinism). */
  evaluatedAt: string;
}

export type Verdict = 'go' | 'caution' | 'no-go';

export type Severity = 'blocker' | 'warning' | 'info';

export interface EvidenceItem {
  /** Stable rule identifier, e.g. "open-blocker". */
  ruleId: string;
  severity: Severity;
  message: string;
  /** Citations backing this finding; rendered as links in reports. */
  refs: IssueRef[];
}

export interface FollowUp {
  /** Suggested subtask summary. */
  title: string;
  /** Why this follow-up exists (traces back to an evidence item). */
  reason: string;
  ruleId: string;
  relatedKey?: string;
}

export interface ReleaseStats {
  totalIssues: number;
  doneIssues: number;
  doneRatio: number;
  openBlockers: number;
  unmergedPrs: number;
  buildsChecked: number;
}

export interface VerdictResult {
  verdict: Verdict;
  /** 0-100 readiness score. Informational; the verdict is severity-driven. */
  score: number;
  headline: string;
  stats: ReleaseStats;
  evidence: EvidenceItem[];
  followUps: FollowUp[];
}
