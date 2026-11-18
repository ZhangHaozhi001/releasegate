/**
 * ReleaseGate issue panel (jira:issuePanel) — UI Kit placeholder.
 *
 * M1/M2 work: call the resolver's `getVerdict` via @forge/bridge
 * `invoke` for the issue in context and render the returned verdict,
 * score and evidence list. The static shell below exists so the module
 * renders something honest (no fake verdict) before that wiring lands.
 */
import ForgeReconciler, { Heading, SectionMessage, Stack, Text } from '@forge/react';
import React from 'react';

const App = () => (
  <Stack space="space.200">
    <Heading as="h3">ReleaseGate verdict</Heading>
    <SectionMessage title="Not yet assessed" appearance="information">
      <Text>
        This panel will show the ReleaseGate GO / CAUTION / NO-GO verdict for this issue, with the cited evidence
        behind it. Ask the ReleaseGate agent in Rovo chat to assess this release, or wait for the panel wiring
        milestone (M1/M2).
      </Text>
    </SectionMessage>
  </Stack>
);

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
