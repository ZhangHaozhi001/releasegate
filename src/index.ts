/**
 * Forge function entry points. Handler paths in manifest.yml point
 * here: `index.resolver`, `index.assessRelease`, etc.
 */

export { handler as resolver } from './forge/resolver.ts';
export { assessRelease, createFollowUpSubtasks, postVerdictComment } from './forge/actions.ts';
