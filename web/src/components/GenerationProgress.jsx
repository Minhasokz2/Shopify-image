import { useEffect, useRef, useState } from 'react';
import { BlockStack, Box, Card, InlineStack, ProgressBar, Text } from '@shopify/polaris';

// STAGE_KEYS mirrors the real, backend-reported pipeline position (job.progressStage, set by
// jobWorker.js at each actual step via modelRouter.js's onStage callback) — not a client-side
// guess. The stage LABEL/INDEX is always real; only the progress bar's fill percentage animates
// smoothly against elapsed time within a stage, purely so the bar doesn't sit dead still for the
// 10-60s a stage can take.
const STAGE_KEYS = ['queued', 'removing_background', 'generating', 'uploading_results'];
const SMOOTH_FILL_SECONDS = 8; // assumed rough duration for the within-stage fill animation

function buildStages({ isCustom, numImages }) {
  const genLabel = isCustom && numImages > 1 ? `Generating ${numImages} images with AI` : 'Generating your image with AI';
  return ['Queued', 'Removing the background', genLabel, 'Preparing your results'];
}

// The worker sets progressStage once it actually starts that step — before the first update
// lands (or for a job resumed from before this field existed), fall back to the earliest
// in-flight stage rather than showing nothing.
function resolveStageKey(job) {
  if (job.status === 'pending') return 'queued';
  return job.progressStage ?? 'removing_background';
}

export function GenerationProgress({ job }) {
  const startedAtRef = useRef(Date.now());
  const lastStageChangeRef = useRef({ stage: null, at: Date.now() });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const isCustom = Boolean(job.modelId);
  const stages = buildStages({ isCustom, numImages: job.numImages ?? 1 });

  const stageKey = resolveStageKey(job);
  const stageIndex = Math.max(0, STAGE_KEYS.indexOf(stageKey));

  if (lastStageChangeRef.current.stage !== stageKey) {
    lastStageChangeRef.current = { stage: stageKey, at: Date.now() };
  }
  const secondsInStage = (Date.now() - lastStageChangeRef.current.at) / 1000;

  // Progress fill: real stage boundary, smooth fill within it, never reaching 100% on its own —
  // only the actual `succeeded` status (handled by the parent, which stops rendering this
  // component) does that.
  const perStage = 100 / stages.length;
  const withinStageFraction = Math.min(1, secondsInStage / SMOOTH_FILL_SECONDS);
  const progress = Math.min(92, Math.round(stageIndex * perStage + withinStageFraction * perStage));

  const elapsedSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const elapsedLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="headingSm">
            {stages[stageIndex]}…
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {elapsedLabel} elapsed
          </Text>
        </InlineStack>
        <ProgressBar progress={progress} tone="primary" />
        <InlineStack gap="150" wrap>
          {stages.map((stage, index) => (
            <Box
              key={stage}
              padding="150"
              borderRadius="200"
              background={index <= stageIndex ? 'bg-fill-brand' : 'bg-surface-secondary'}
            >
              <Text as="span" variant="bodySm" tone={index <= stageIndex ? 'text-inverse' : 'subdued'}>
                {stage}
              </Text>
            </Box>
          ))}
        </InlineStack>
        <Text as="span" tone="subdued" variant="bodySm">
          This usually takes 30–90 seconds. Feel free to leave this page — your generation will keep running and
          you can find it later from Job History.
        </Text>
      </BlockStack>
    </Card>
  );
}

export default GenerationProgress;
