import { useEffect, useRef, useState } from 'react';
import { BlockStack, Box, Card, InlineStack, ProgressBar, Text } from '@shopify/polaris';

// The backend only ever reports two in-flight statuses (`pending`, `processing`) — there is no
// granular sub-status from the job worker (removing background vs. calling the model vs.
// uploading results). Rather than show a progress bar frozen at one fixed number the whole time
// a job runs, this simulates the pipeline's real stages (they always run in this order — see
// jobWorker.js's runTemplateGeneration/runCustomGeneration) against elapsed wall-clock time, so
// the merchant sees continuous motion instead of a stalled-looking bar.
const STAGE_SECONDS = 6; // rough time per stage before advancing to the next, capped before 100%

function buildStages({ isCustom, numImages }) {
  const genLabel = isCustom && numImages > 1 ? `Generating ${numImages} images with AI` : 'Generating your image with AI';
  return ['Queued', 'Removing the background', genLabel, 'Preparing your results'];
}

export function GenerationProgress({ job }) {
  const startedAtRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isCustom = Boolean(job.modelId);
  const stages = buildStages({ isCustom, numImages: job.numImages ?? 1 });

  // Stage 0 ("Queued") only while the job hasn't started processing yet; once it flips to
  // `processing`, skip straight to stage 1 regardless of elapsed time so the UI never looks
  // stuck on "Queued" after the worker has actually picked it up.
  const minStageIndex = job.status === 'processing' ? 1 : 0;
  const elapsedStageIndex = Math.min(stages.length - 1, Math.floor(elapsedSeconds / STAGE_SECONDS));
  const stageIndex = Math.max(minStageIndex, elapsedStageIndex);

  // Progress fill: steady advance per stage, but never reaches 100% on its own — only the actual
  // `succeeded` status (handled by the parent, which stops rendering this component) does that.
  const perStage = 100 / stages.length;
  const withinStageFraction = Math.min(1, (elapsedSeconds % STAGE_SECONDS) / STAGE_SECONDS);
  const progress = Math.min(92, Math.round(stageIndex * perStage + withinStageFraction * perStage));

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
