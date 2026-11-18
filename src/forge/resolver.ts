/**
 * UI resolver backing both Forge UI modules:
 *   jira:issuePanel  -> getVerdict (verdict card on the release issue)
 *   jira:adminPage   -> getConfig / saveConfig (threshold editor)
 *
 * TODO(M2): enforce that saveConfig is only honoured for site/project
 * admins (check the caller's permissions via the Forge context and the
 * Jira permissions API) before this ships beyond the dev site.
 */

import { storage } from '@forge/api';
import Resolver from '@forge/resolver';

import { resolveConfig, type ReleaseGateConfig } from '../core/config.ts';
import { evaluateRelease } from '../core/evaluate.ts';
import { CONFIG_STORAGE_KEY, loadConfig } from './actions.ts';
import { fetchReleaseContext } from './jiraClient.ts';

const resolver = new Resolver();

resolver.define('getVerdict', async ({ context }) => {
  const issueKey = (context?.extension?.issue?.key as string) ?? '';
  if (!issueKey) return { error: 'No issue in context.' };
  const cfg = await loadConfig();
  const { input } = await fetchReleaseContext(issueKey);
  const result = evaluateRelease(input, cfg);
  return { issueKey, ...result };
});

resolver.define('getConfig', async () => {
  return { config: await loadConfig() };
});

resolver.define('saveConfig', async ({ payload }) => {
  const partial = (payload?.config ?? {}) as Partial<ReleaseGateConfig>;
  const validated = resolveConfig(partial); // throws on invalid values
  await storage.set(CONFIG_STORAGE_KEY, validated);
  return { config: validated };
});

export const handler = resolver.getDefinitions();
