/**
 * Rovo action handlers for ReleaseGate.
 *
 * Each export is wired from manifest.yml:
 *   action `assess-release`            -> fn-assess-release            -> assessRelease
 *   action `create-follow-up-subtasks` -> fn-create-follow-ups         -> createFollowUpSubtasks
 *   action `post-verdict-comment`      -> fn-post-verdict-comment      -> postVerdictComment
 *
 * Handlers are plain async functions (Rovo actions do not use the UI
 * Resolver pattern). The action payload carries the declared inputs
 * (releaseIssueKey) at the top level.
 */

import { storage } from '@forge/api';

import { DEFAULT_CONFIG, resolveConfig, type ReleaseGateConfig } from '../core/config.ts';
import { evaluateRelease } from '../core/evaluate.ts';
import { renderText, toAdf } from '../core/report.ts';
import type { VerdictResult } from '../core/types.ts';
import { addComment, createSubtask, fetchReleaseContext } from './jiraClient.ts';

export const CONFIG_STORAGE_KEY = 'releasegate:config';

interface ActionPayload {
  releaseIssueKey?: string;
  [key: string]: unknown;
}

function requireReleaseKey(payload: ActionPayload): string {
  const key = payload?.releaseIssueKey;
  if (!key || typeof key !== 'string') {
    throw new Error('ReleaseGate: input "releaseIssueKey" is required.');
  }
  return key;
}

/** Thresholds saved from the admin configuration page, over defaults. */
export async function loadConfig(): Promise<ReleaseGateConfig> {
  const stored = (await storage.get(CONFIG_STORAGE_KEY)) as Partial<ReleaseGateConfig> | undefined;
  try {
    return resolveConfig(stored);
  } catch {
    // A corrupt stored config must not break assessments; fall back to
    // defaults (the admin page re-validates on save).
    return { ...DEFAULT_CONFIG };
  }
}

async function assess(releaseIssueKey: string): Promise<{ result: VerdictResult; reportText: string }> {
  const cfg = await loadConfig();
  const { input } = await fetchReleaseContext(releaseIssueKey);
  const result = evaluateRelease(input, cfg);
  return { result, reportText: renderText(input, result) };
}

export async function assessRelease(payload: ActionPayload) {
  const releaseIssueKey = requireReleaseKey(payload);
  const { result, reportText } = await assess(releaseIssueKey);
  return {
    verdict: result.verdict,
    score: result.score,
    headline: result.headline,
    stats: result.stats,
    evidence: result.evidence,
    followUps: result.followUps,
    report: reportText,
  };
}

export async function createFollowUpSubtasks(payload: ActionPayload) {
  const releaseIssueKey = requireReleaseKey(payload);
  const { input, projectKey } = await fetchReleaseContext(releaseIssueKey);
  const cfg = await loadConfig();
  const result = evaluateRelease(input, cfg);

  const created: string[] = [];
  for (const followUp of result.followUps) {
    created.push(await createSubtask(projectKey, releaseIssueKey, followUp.title));
  }
  return {
    releaseIssueKey,
    createdCount: created.length,
    created,
    message:
      created.length === 0
        ? 'The latest assessment produced no follow-ups, so no subtasks were created.'
        : `Created ${created.length} follow-up subtask(s) on ${releaseIssueKey}.`,
  };
}

export async function postVerdictComment(payload: ActionPayload) {
  const releaseIssueKey = requireReleaseKey(payload);
  const { input } = await fetchReleaseContext(releaseIssueKey);
  const cfg = await loadConfig();
  const result = evaluateRelease(input, cfg);
  await addComment(releaseIssueKey, toAdf(input, result));
  return {
    releaseIssueKey,
    verdict: result.verdict,
    score: result.score,
    message: `Posted the ReleaseGate verdict (${result.verdict.toUpperCase()}, score ${result.score}/100) as a comment on ${releaseIssueKey}.`,
  };
}
