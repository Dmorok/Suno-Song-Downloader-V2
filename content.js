function scrapeWorkspaceName() {
    const sanitize = (s) => s?.trim().replace(/[\/\\:*?"<>|]/g, '-') || '';

    // Suno's workspace-name element uses auto-generated CSS module class names
    // that shift whenever they redeploy, so try every selector we've seen work
    // before falling back to a heuristic.
    const knownSelectors = ['div.css-9rwmp5.e1wyop193', 'div.css-55xecx.e1sz90n63'];
    for (const selector of knownSelectors) {
        const text = sanitize(document.querySelector(selector)?.textContent);
        if (text) return text;
    }

    // Fallback: the page <title> is usually "Workspace Name | Suno" or similar.
    const titleGuess = sanitize(document.title.split(/[|\-–]/)[0]);
    if (titleGuess && !/^suno$/i.test(titleGuess)) return titleGuess;

    return 'Suno Downloads';
}

const downloadIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" class="-ml-1 h-4 w-4">
  <path d="M12 15.586l-4.293-4.293a1 1 0 0 0-1.414 1.414l5 5a1 1 0 0 0 1.414 0l5-5a1 1 0 0 0-1.414-1.414L12 15.586z"/>
  <path d="M12 4a1 1 0 0 0-1 1v9a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1z"/>
  <path d="M5 19a1 1 0 0 0 1 1h12a1 1 0 1 0 0-2H6a1 1 0 0 0-1 1z"/>
</svg>`;

function injectDownloadButtons() {
    const songItems = document.querySelectorAll('div[class*="content-container"] a[href*="/song/"]');

    songItems.forEach(songLink => {
        const songContainer = songLink.closest('div[style*="grid-template-columns"]');
        if (!songContainer || songContainer.classList.contains('suno-dl-buttons-injected')) {
            return;
        }
        songContainer.classList.add('suno-dl-buttons-injected');
        
        const actionsContainer = songContainer.querySelector('div[class*="gap"]'); 
        if (!actionsContainer) return;

        const uuid = songLink.href.split('/song/')[1]?.split('/')[0];
        const title = songLink.textContent?.trim().replace(/[\/\\:*?"<>|]/g, '-');
        if (!uuid || !title) return;

        const song = { id: uuid, name: title };
        const mp3Button = createDownloadButton('MP3', song, 'mp3');
        const wavButton = createDownloadButton('WAV', song, 'wav');

        actionsContainer.appendChild(mp3Button);
        actionsContainer.appendChild(wavButton);
    });
}

function createDownloadButton(format, song, formatKey) {
    const button = document.createElement('button');
    button.className = 'relative inline-block font-sans font-medium text-center before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:border before:border-transparent before:bg-transparent after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:bg-transparent after:opacity-0 enabled:hover:after:opacity-100 transition duration-75 before:transition before:duration-75 after:transition after:duration-75 select-none cursor-pointer px-4 py-2 rounded-full text-foreground-primary bg-background-tertiary enabled:hover:before:bg-overlay-on-primary text-xs';
    button.style.marginLeft = '8px';

    button.innerHTML = `<span class="relative flex flex-row items-center justify-center gap-2">${downloadIconSvg} ${format}</span>`;

    button.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        button.innerHTML = `<span>...</span>`;

        const defaultSettings = { createSubfolder: true, includeJpeg: true, includeUuid: true };
        const data = await chrome.storage.sync.get({ settings: defaultSettings });

        const workspaceName = scrapeWorkspaceName();

        chrome.runtime.sendMessage({
            action: 'manualDownload',
            payload: { song, format: formatKey, settings: data.settings, workspaceName }
        });

        setTimeout(() => {
            button.innerHTML = `<span class="relative flex flex-row items-center justify-center gap-2">${downloadIconSvg} ${format}</span>`;
        }, 2000);
    };
    return button;
}

const observer = new MutationObserver(() => injectDownloadButtons());
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectDownloadButtons, 1000);

