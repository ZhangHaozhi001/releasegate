/**
 * Constructed demo data (NOT real Jira data).
 *
 * Two scenarios used by the CLI demo and mirrored later by the test-site
 * seed data at M1:
 *  - REL-101 "Payments v2.4.0": a healthy release that must come out GO.
 *  - REL-102 "Payments v2.5.0": a doomed release (open blockers, a
 *    declined PR, a failed build, stale/overdue work) that must come
 *    out NO-GO with a cited evidence list — this is the demo video's
 *    story arc: the release that would have shipped broken, stopped
 *    by the gate with receipts.
 */

import type { ReleaseInput } from '../core/types.ts';

const BASE = 'https://example.atlassian.net/browse/';
export const EVALUATED_AT = '2026-11-19T09:00:00.000Z';

export const healthyRelease: ReleaseInput = {
  release: { key: 'REL-101', summary: 'Payments v2.4.0 release', url: `${BASE}REL-101`, fixVersion: '2.4.0' },
  evaluatedAt: EVALUATED_AT,
  linkedIssues: [
    { key: 'PAY-11', summary: 'Tokenised card checkout', url: `${BASE}PAY-11`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T10:00:00.000Z' },
    { key: 'PAY-12', summary: 'Refund webhook retries', url: `${BASE}PAY-12`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T11:00:00.000Z' },
    { key: 'PAY-13', summary: '3DS2 fallback flow', url: `${BASE}PAY-13`, statusCategory: 'done', isBlockerPriority: true, blocksRelease: false, updatedAt: '2026-11-17T09:00:00.000Z' },
    { key: 'PAY-14', summary: 'Settlement report export', url: `${BASE}PAY-14`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T08:30:00.000Z' },
    { key: 'PAY-15', summary: 'Apple Pay domain verification', url: `${BASE}PAY-15`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-16T15:00:00.000Z' },
    { key: 'PAY-16', summary: 'Release notes draft', url: `${BASE}PAY-16`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T12:00:00.000Z' },
  ],
  pullRequests: [
    { id: 'PR-501', title: 'feat: tokenised checkout', url: 'https://bitbucket.example.org/pr/501', state: 'merged', issueKey: 'PAY-11' },
    { id: 'PR-502', title: 'fix: webhook retry backoff', url: 'https://bitbucket.example.org/pr/502', state: 'merged', issueKey: 'PAY-12' },
    { id: 'PR-503', title: 'feat: 3DS2 fallback', url: 'https://bitbucket.example.org/pr/503', state: 'merged', issueKey: 'PAY-13' },
  ],
  builds: [
    { name: 'payments-ci #482', state: 'successful', url: 'https://ci.example.org/build/482', finishedAt: '2026-11-18T22:00:00.000Z' },
  ],
};

export const doomedRelease: ReleaseInput = {
  release: { key: 'REL-102', summary: 'Payments v2.5.0 release', url: `${BASE}REL-102`, fixVersion: '2.5.0' },
  evaluatedAt: EVALUATED_AT,
  linkedIssues: [
    { key: 'PAY-21', summary: 'New pricing engine', url: `${BASE}PAY-21`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T10:00:00.000Z' },
    { key: 'PAY-22', summary: 'Invoice PDF generation', url: `${BASE}PAY-22`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T10:00:00.000Z' },
    { key: 'PAY-23', summary: 'Tax calculation update', url: `${BASE}PAY-23`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-17T10:00:00.000Z' },
    { key: 'PAY-24', summary: 'Merchant onboarding flow', url: `${BASE}PAY-24`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T09:00:00.000Z' },
    { key: 'PAY-25', summary: 'Ledger migration script', url: `${BASE}PAY-25`, statusCategory: 'done', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-15T09:00:00.000Z' },
    { key: 'PAY-26', summary: 'Data corruption in settlement batch', url: `${BASE}PAY-26`, statusCategory: 'in-progress', isBlockerPriority: true, blocksRelease: true, updatedAt: '2026-11-18T18:00:00.000Z' },
    { key: 'PAY-27', summary: 'PCI scope sign-off', url: `${BASE}PAY-27`, statusCategory: 'to-do', isBlockerPriority: false, blocksRelease: true, updatedAt: '2026-11-18T09:00:00.000Z' },
    { key: 'PAY-28', summary: 'Fraud rules tuning', url: `${BASE}PAY-28`, statusCategory: 'in-progress', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-10-30T09:00:00.000Z' },
    { key: 'PAY-29', summary: 'Chargeback dispute export', url: `${BASE}PAY-29`, statusCategory: 'to-do', isBlockerPriority: false, blocksRelease: false, dueDate: '2026-11-10', updatedAt: '2026-11-12T09:00:00.000Z' },
    { key: 'PAY-30', summary: 'Multi-currency rounding fix', url: `${BASE}PAY-30`, statusCategory: 'in-progress', isBlockerPriority: false, blocksRelease: false, updatedAt: '2026-11-18T07:00:00.000Z' },
  ],
  pullRequests: [
    { id: 'PR-601', title: 'feat: pricing engine core', url: 'https://bitbucket.example.org/pr/601', state: 'merged', issueKey: 'PAY-21' },
    { id: 'PR-602', title: 'feat: ledger migration (unsafe)', url: 'https://bitbucket.example.org/pr/602', state: 'declined', issueKey: 'PAY-25' },
    { id: 'PR-603', title: 'fix: rounding for JPY/ZAR', url: 'https://bitbucket.example.org/pr/603', state: 'open', issueKey: 'PAY-30' },
  ],
  builds: [
    { name: 'payments-ci #517', state: 'failed', url: 'https://ci.example.org/build/517', finishedAt: '2026-11-19T06:40:00.000Z' },
  ],
};
