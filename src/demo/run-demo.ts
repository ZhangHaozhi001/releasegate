/**
 * ReleaseGate CLI demo — runs the verdict engine over constructed data.
 *
 *   node src/demo/run-demo.ts            (Node >= 22.6 type stripping)
 *   npm run demo
 *
 * Proves the logic loop end-to-end (input -> verdict -> cited evidence
 * -> follow-ups -> comment body) without any Atlassian account.
 */

import { evaluateRelease } from '../core/evaluate.ts';
import { renderText, toAdf } from '../core/report.ts';
import { doomedRelease, healthyRelease } from './fixtures.ts';

for (const input of [healthyRelease, doomedRelease]) {
  const result = evaluateRelease(input);
  console.log('='.repeat(78));
  console.log(renderText(input, result));
  console.log('');
  console.log('Jira comment body (ADF) that the post-verdict-comment action would post:');
  console.log(JSON.stringify(toAdf(input, result), null, 2));
  console.log('');
}
