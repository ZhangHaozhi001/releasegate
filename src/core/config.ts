/**
 * ReleaseGate rule thresholds.
 *
 * Every threshold that decides a verdict lives here so a Jira project
 * admin can tune ReleaseGate from the app configuration page instead of
 * the behaviour being hard-coded (Codegeist Stage One explicitly
 * rejects hard-coded demo paths).
 */

export interface ReleaseGateConfig {
  /**
   * Open blockers tolerated before they escalate to a no-go.
   * Open blockers at or below this count are reported as warnings.
   */
  maxOpenBlockers: number;
  /**
   * Unmerged (open, not declined) pull requests tolerated before they
   * escalate to a no-go. Declined PRs are always blockers.
   */
  maxUnmergedPrs: number;
  /** An unfinished issue not updated within this many days is "stale". */
  staleDays: number;
  /** Done-ratio below this (but above the blocker floor) warns. */
  doneRatioWarningBelow: number;
  /** Done-ratio below this floor is a blocker: the scope is not releasable. */
  doneRatioBlockerBelow: number;
  /** When true, a failed or missing build result blocks the release. */
  requireSuccessfulBuild: boolean;
}

export const DEFAULT_CONFIG: ReleaseGateConfig = {
  maxOpenBlockers: 0,
  maxUnmergedPrs: 0,
  staleDays: 7,
  doneRatioWarningBelow: 1,
  doneRatioBlockerBelow: 0.8,
  requireSuccessfulBuild: true,
};

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`ReleaseGate config: ${name} must be a non-negative integer, got ${value}`);
  }
}

function assertRatio(name: string, value: number): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`ReleaseGate config: ${name} must be a ratio between 0 and 1, got ${value}`);
  }
}

/**
 * Merge a partial (e.g. admin-page supplied) config over the defaults
 * and validate the result. Throws on invalid values so a bad config
 * fails loudly instead of silently changing verdict semantics.
 */
export function resolveConfig(partial?: Partial<ReleaseGateConfig>): ReleaseGateConfig {
  const cfg: ReleaseGateConfig = { ...DEFAULT_CONFIG, ...(partial ?? {}) };

  assertCount('maxOpenBlockers', cfg.maxOpenBlockers);
  assertCount('maxUnmergedPrs', cfg.maxUnmergedPrs);
  if (!Number.isInteger(cfg.staleDays) || cfg.staleDays < 0) {
    throw new Error(`ReleaseGate config: staleDays must be a non-negative integer, got ${cfg.staleDays}`);
  }
  assertRatio('doneRatioWarningBelow', cfg.doneRatioWarningBelow);
  assertRatio('doneRatioBlockerBelow', cfg.doneRatioBlockerBelow);
  if (cfg.doneRatioBlockerBelow > cfg.doneRatioWarningBelow) {
    throw new Error(
      'ReleaseGate config: doneRatioBlockerBelow must be <= doneRatioWarningBelow ' +
        `(got blocker=${cfg.doneRatioBlockerBelow}, warning=${cfg.doneRatioWarningBelow})`,
    );
  }
  if (typeof cfg.requireSuccessfulBuild !== 'boolean') {
    throw new Error(`ReleaseGate config: requireSuccessfulBuild must be boolean, got ${cfg.requireSuccessfulBuild}`);
  }
  return cfg;
}
