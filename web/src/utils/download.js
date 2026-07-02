// Forces a save-to-disk for any generated result (Cloudinary-hosted, so a different origin than
// this app). The `download` attribute on a plain <a> is unreliable cross-origin — most browsers
// just navigate to/open the file instead of saving it — so this fetches the file as a blob and
// downloads that instead, which works regardless of origin as long as the URL is fetchable.
// Falls back to opening the file in a new tab if the fetch fails for any reason (CORS, network),
// so the merchant can still save it manually rather than getting nothing.
export async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download request failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}
