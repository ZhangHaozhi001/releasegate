/**
 * ReleaseGate configuration page (jira:adminPage, useAsConfig) —
 * UI Kit placeholder.
 *
 * M2 work: bind these fields to the resolver's getConfig / saveConfig
 * so project admins can tune the verdict thresholds without touching
 * code. Field names mirror ReleaseGateConfig in src/core/config.ts:
 *   maxOpenBlockers, maxUnmergedPrs, staleDays,
 *   doneRatioWarningBelow, doneRatioBlockerBelow, requireSuccessfulBuild
 */
import ForgeReconciler, { Heading, SectionMessage, Stack, Text } from '@forge/react';
import React from 'react';

const App = () => (
  <Stack space="space.200">
    <Heading as="h2">ReleaseGate configuration</Heading>
    <SectionMessage title="Threshold editor coming in M2" appearance="information">
      <Text>
        ReleaseGate currently runs on its default thresholds: no open blockers tolerated, no unmerged pull
        requests tolerated, issues stale after 7 days, releases below 80% scope completion are blocked, and a
        successful build is required. This page will let admins adjust each threshold per project.
      </Text>
    </SectionMessage>
  </Stack>
);

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
