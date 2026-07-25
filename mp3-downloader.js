// mp3-downloader.js

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function forceDownload(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);
    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) console.error(`Download API failed for "${fileName}":`, chrome.runtime.lastError.message);
    });
  } catch (error) {
    console.error(`Download failed for ${fileName}:`, error);
  }
}

export async function downloadMp3(song, settings, workspaceName) {
  const { id: uuid, name: title } = song;

  // Filename logic
  const baseMp3Filename = settings.includeUuid ? `${title} - ${uuid}.mp3` : `${title}.mp3`;
  let finalMp3Filename = baseMp3Filename;
  if (settings.createSubfolder && workspaceName) {
    // MODIFIED: Changed from suffix to prefix
    finalMp3Filename = `SUNO_${workspaceName}/${baseMp3Filename}`;
  }
  await forceDownload(`https://cdn1.suno.ai/${uuid}.mp3`, finalMp3Filename);

  // Image download logic
  if (settings.includeJpeg) {
    const baseImageFilename = settings.includeUuid ? `${title} - ${uuid}.jpeg` : `${title}.jpeg`;
    let finalImageFilename = baseImageFilename;
    if (settings.createSubfolder && workspaceName) {
        // MODIFIED: Changed from suffix to prefix
        finalImageFilename = `SUNO_${workspaceName}/${baseImageFilename}`;
    }
    await forceDownload(`https://cdn2.suno.ai/image_large_${uuid}.jpeg`, finalImageFilename);
  }
}