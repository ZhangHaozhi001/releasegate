/**
 * Jira data access + mapping into ReleaseGate core types.
 *
 * This is the ONLY file that knows Jira REST payload shapes. Everything
 * downstream (core engine) works on the platform-agnostic types.
 *
 * Endpoint confidence notes (skeleton stage, no dev site yet):
 *  - Issue get / comment post / issue create: stable REST API v3 paths.
 *  - Search: uses POST /rest/api/3/search/jql (the current endpoint;
 *    the legacy GET /rest/api/3/search was retired by Atlassian).
 *    TODO(verify-at-deploy): confirm behaviour + pagination shape on
 *    the developer site at M1.
 *  - Development info (PRs): GET /rest/dev-status/latest/issue/detail.
 *    TODO(verify-at-deploy): confirm response shape on the dev site.
 *  - Build results: Jira exposes build data in the development panel
 *    only when a CI app is connected; there is no single stable REST
 *    read for it. fetchBuilds() therefore returns [] for now, which
 *    the engine honestly reports as a "no build evidence" warning
 *    instead of pretending the build is green. Wiring a concrete CI
 *    source is an M1 task.
 */

import api, { route } from '@forge/api';

import type { BuildResult, LinkedIssue, PullRequest, ReleaseInput, StatusCategory } from '../core/types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const BLOCKER_PRIORITY_NAMES = new Set(['Blocker', 'Highest']);

function browseUrl(siteUrl: string, key: string): string {
  return siteUrl ? `${siteUrl.replace(/\/$/, '')}/browse/${key}` : `/browse/${key}`;
}

function mapStatusCategory(issue: AnyRecord): StatusCategory {
  const key = issue?.fields?.status?.statusCategory?.key as string | undefined;
  if (key === 'done') return 'done';
  if (key === 'indeterminate') return 'in-progress';
  return 'to-do';
}

function mapIssue(issue: AnyRecord, siteUrl: string, blocksRelease = false): LinkedIssue {
  const key = issue.key as string;
  return {
    key,
    summary: (issue?.fields?.summary as string) ?? key,
    url: browseUrl(siteUrl, key),
    statusCategory: mapStatusCategory(issue),
    isBlockerPriority: BLOCKER_PRIORITY_NAMES.has(issue?.fields?.priority?.name as string),
    blocksRelease,
    dueDate: (issue?.fields?.duedate as string) ?? undefined,
    updatedAt: (issue?.fields?.updated as string) ?? new Date(0).toISOString(),
  };
}

async function fetchIssue(issueKey: string): Promise<AnyRecord> {
  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,status,priority,duedate,updated,issuelinks,fixVersions,project`);
  if (!res.ok) {
    throw new Error(`ReleaseGate: failed to read issue ${issueKey} (HTTP ${res.status})`);
  }
  return (await res.json()) as AnyRecord;
}

async function searchIssues(jql: string): Promise<AnyRecord[]> {
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql,
      fields: ['summary', 'status', 'priority', 'duedate', 'updated', 'issuelinks'],
      maxResults: 200,
    }),
  });
  if (!res.ok) {
    throw new Error(`ReleaseGate: JQL search failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as AnyRecord;
  return (data.issues as AnyRecord[]) ?? [];
}

async function fetchPullRequests(issueId: string): Promise<PullRequest[]> {
  // TODO(verify-at-deploy): dev-status response shape varies by
  // application type; parsing below is defensive on purpose.
  const res = await api
    .asApp()
    .requestJira(route`/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=bitbucket&dataType=pullrequest`);
  if (!res.ok) return [];
  const data = (await res.json()) as AnyRecord;
  const prs: PullRequest[] = [];
  for (const detail of (data.detail as AnyRecord[]) ?? []) {
    for (const pr of (detail.pullRequests as AnyRecord[]) ?? []) {
      const status = String(pr.status ?? '').toUpperCase();
      prs.push({
        id: String(pr.id ?? pr.name ?? 'PR'),
        title: String(pr.name ?? pr.title ?? 'Pull request'),
        url: String(pr.url ?? ''),
        state: status === 'MERGED' ? 'merged' : status === 'DECLINED' ? 'declined' : 'open',
      });
    }
  }
  return prs;
}

async function fetchBuilds(_issueId: string): Promise<BuildResult[]> {
  // See header note: no stable REST read for build results without a
  // connected CI app. Returning [] makes the engine emit an honest
  // "no build evidence" warning rather than a fabricated pass.
  return [];
}

export interface ReleaseContext {
  input: ReleaseInput;
  projectKey: string;
}

/**
 * Gather everything the engine needs for one release issue:
 * the issue itself, its linked issues (incl. "is blocked by"),
 * the issues in its fix version, PRs and builds.
 */
export async function fetchReleaseContext(releaseIssueKey: string, siteUrl = ''): Promise<ReleaseContext> {
  const release = await fetchIssue(releaseIssueKey);
  const projectKey = (release?.fields?.project?.key as string) ?? releaseIssueKey.split('-')[0];

  const byKey = new Map<string, LinkedIssue>();

  // Linked issues from the release issue itself.
  for (const link of (release?.fields?.issuelinks as AnyRecord[]) ?? []) {
    const typeName = link?.type?.name as string | undefined;
    if (link.inwardIssue) {
      // inwardIssue is the issue on the other end of an inward link;
      // for a "Blocks" link that means: inwardIssue blocks this release.
      byKey.set(link.inwardIssue.key, mapIssue(link.inwardIssue, siteUrl, typeName === 'Blocks'));
    }
    if (link.outwardIssue) {
      byKey.set(link.outwardIssue.key, mapIssue(link.outwardIssue, siteUrl, false));
    }
  }

  // Fix-version scope.
  const fixVersions = (release?.fields?.fixVersions as AnyRecord[]) ?? [];
  const fixVersion = fixVersions[0]?.name as string | undefined;
  if (fixVersion) {
    const escaped = fixVersion.replace(/"/g, '\\"');
    const scoped = await searchIssues(`project = "${projectKey}" AND fixVersion = "${escaped}"`);
    for (const iss of scoped) {
      if (iss.key !== releaseIssueKey && !byKey.has(iss.key)) {
        byKey.set(iss.key, mapIssue(iss, siteUrl, false));
      }
    }
  }

  const issueId = String(release.id ?? '');
  const [pullRequests, builds] = await Promise.all([fetchPullRequests(issueId), fetchBuilds(issueId)]);

  return {
    projectKey,
    input: {
      release: {
        key: releaseIssueKey,
        summary: (release?.fields?.summary as string) ?? releaseIssueKey,
        url: browseUrl(siteUrl, releaseIssueKey),
        fixVersion,
      },
      linkedIssues: [...byKey.values()],
      pullRequests,
      builds,
      evaluatedAt: new Date().toISOString(),
    },
  };
}

export async function createSubtask(projectKey: string, parentKey: string, summary: string): Promise<string> {
  // TODO(verify-at-deploy): the subtask issue type name is
  // site-configurable ("Sub-task" is the Jira default); resolve its id
  // via /rest/api/3/issuetype if creation fails on the dev site.
  const res = await api.asApp().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        parent: { key: parentKey },
        summary,
        issuetype: { name: 'Sub-task' },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`ReleaseGate: failed to create subtask under ${parentKey} (HTTP ${res.status})`);
  }
  const data = (await res.json()) as AnyRecord;
  return String(data.key ?? '');
}

export async function addComment(issueKey: string, adfBody: Record<string, unknown>): Promise<void> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfBody }),
  });
  if (!res.ok) {
    throw new Error(`ReleaseGate: failed to comment on ${issueKey} (HTTP ${res.status})`);
  }
}
