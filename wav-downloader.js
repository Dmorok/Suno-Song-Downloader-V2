// wav-downloader.js

// Reusable function to convert a file blob to a downloadable data: URL.
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// This function attempts to download a file and returns true on success, false on failure.
async function attemptDownload(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Attempt failed for ${fileName}. Status: ${response.status}`);
      return false; // Indicate failure
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);
    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'uniquify'
    });
    return true; // Indicate success
  } catch (error) {
    console.error(`Download fetch failed for ${fileName}:`, error);
    return false; // Indicate failure
  }
}

// Runs inside the page itself (MAIN world) so it can see window.Clerk, which
// content-script/isolated-world code cannot access. This replaces the old
// approach of dispatching a CustomEvent to a separate injected.js file that
// was never actually loaded into the page — that's why WAV conversion
// silently failed to ever fire.
function triggerConversionInPage(clipId) {
  async function getAuthToken() {
    try {
      if (window.Clerk?.session) {
        const token = await window.Clerk.session.getToken();
        if (token) return token;
      }
    } catch (e) { /* fall through to cookie */ }
    const cookie = document.cookie.split('; ').find(c => c.trim().startsWith('__session='));
    return cookie ? cookie.split('=')[1].trim() : null;
  }

  return (async () => {
    const token = await getAuthToken();
    if (!token) return { success: false, error: 'No auth token found (are you logged in?)' };
    try {
      const res = await fetch(`https://studio-api.prod.suno.com/api/gen/${clipId}/convert_wav/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return { success: res.ok, status: res.status };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  })();
}

// The main exported function, with a MAIN-world trigger and a generous retry
// loop, since WAV conversion on Suno's side can take a while to finish.
export async function downloadWav(song, tabId, settings, workspaceName) {
  const { id: uuid, name: title } = song;
  const cdnUrl = `https://cdn1.suno.ai/${uuid}.wav`;
  const baseWavFilename = settings.includeUuid ? `${title} - ${uuid}.wav` : `${title}.wav`;
  let finalWavFilename = baseWavFilename;
  if (settings.createSubfolder && workspaceName) {
    finalWavFilename = `SUNO_${workspaceName}/${baseWavFilename}`;
  }

  try {
    // Step 1: Trigger the WAV conversion on the server, running directly in
    // the page's own JS context so it can read the real session token.
    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: triggerConversionInPage,
      args: [uuid],
      world: 'MAIN'
    });

    const triggerOutcome = injectionResult?.result;
    if (!triggerOutcome?.success) {
      console.warn(
        `[WAV] Trigger warning for "${title}":`,
        triggerOutcome?.error || `HTTP ${triggerOutcome?.status}`
      );
      // Don't bail out yet — the clip may already have a cached WAV from a
      // previous conversion, so still attempt the download retry loop below.
    }

    // Step 2: Start the retry loop to download the file directly from the CDN.
    let downloaded = false;
    const maxRetries = 8;
    const firstDelay = 6000;  // WAV conversion needs a moment to start
    const retryDelay = 4000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const wait = attempt === 1 ? firstDelay : retryDelay;
      console.log(`[WAV] Attempt ${attempt}/${maxRetries} for "${title}": waiting ${wait / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, wait));

      downloaded = await attemptDownload(cdnUrl, finalWavFilename);

      if (downloaded) {
        console.log(`[WAV] Success! Download initiated for "${title}".`);
        break;
      } else {
        console.log(`[WAV] File not ready on attempt ${attempt}.`);
      }
    }

    if (!downloaded) {
      throw new Error(`Skipped after ${maxRetries} failed attempts.`);
    }

    // If WAV download was successful, download the image.
    if (settings.includeJpeg) {
      const baseImageFilename = settings.includeUuid ? `${title} - ${uuid}.jpeg` : `${title}.jpeg`;
      let finalImageFilename = baseImageFilename;
      if (settings.createSubfolder && workspaceName) {
        finalImageFilename = `SUNO_${workspaceName}/${baseImageFilename}`;
      }
      // Use the same robust download function for the image
      await attemptDownload(`https://cdn2.suno.ai/image_large_${uuid}.jpeg`, finalImageFilename);
    }
  } catch (error) {
    console.error(`[WAV] Failed to download "${title}":`, error.message);
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Failed: ${title}` }
    });
  }
}
