import { downloadMp3 } from './mp3-downloader.js';
import { downloadWav } from './wav-downloader.js';

let downloadState = {
  inProgress: false,
  text: ''
};

let isStopRequested = false;

async function processQueue(queue, tabId, settings, workspaceName) {
  isStopRequested = false;
  downloadState.inProgress = true;

  for (let i = 0; i < queue.length; i++) {
    if (isStopRequested) {
      downloadState.inProgress = false;
      chrome.runtime.sendMessage({ action: 'downloadComplete', payload: { text: `Download stopped.` } });
      break;
    }
    
    const currentSong = queue[i];
    downloadState.text = `Downloading ${currentSong.name} (${i + 1}/${queue.length})...`;
    chrome.runtime.sendMessage({ action: 'updateStatus', payload: { text: downloadState.text } });
    
    if (currentSong.format === 'mp3') {
      await downloadMp3(currentSong, settings, workspaceName);
    } else if (currentSong.format === 'wav') {
      await downloadWav(currentSong, tabId, settings, workspaceName);
    }

    const delay = (settings.delay && !isNaN(settings.delay) ? settings.delay : 3) * 1000;
    if (delay > 0 && i < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  if (!isStopRequested) {
    downloadState.inProgress = false;
    chrome.runtime.sendMessage({ action: 'downloadComplete', payload: { text: `Finished ${queue.length} downloads.` } });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startDownload') {
    const { songs, format, tabId, settings, workspaceName } = message.payload;
    const queue = songs.map(song => ({ ...song, format }));
    processQueue(queue, tabId, settings, workspaceName);
  } else if (message.action === 'stopDownload') {
    isStopRequested = true;
  } else if (message.action === 'getDownloadState') {
    sendResponse(downloadState);
  } else if (message.action === 'manualDownload') {
    const { song, format, settings, workspaceName } = message.payload;
    const tabId = sender.tab.id;
    if (format === 'mp3') {
        downloadMp3(song, settings, workspaceName);
    } else if (format === 'wav') {
        downloadWav(song, tabId, settings, workspaceName);
    }
  }
  return true;
});

