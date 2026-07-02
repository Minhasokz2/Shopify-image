// Shared by ImageOptimizerConvert.jsx and GenerationReview.jsx (compressing a freshly generated
// result) — infers a SUPPORTED_INPUT_FORMATS-compatible extension from a delivery URL rather than
// requiring the caller to already know it.
export function inferFormatFromUrl(url) {
  try {
    const clean = url.split('?')[0];
    const ext = clean.split('.').pop().toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    return '';
  }
}
