(() => {
    const channel = '8bit_pixiee';
    const parents = new Set();
    const addParent = value => {
        try {
            const url = new URL(value);
            if (/^https?:$/.test(url.protocol) && url.hostname) parents.add(url.hostname);
        } catch { /* Ignore unavailable ancestor locations. */ }
    };
    addParent(location.href);
    // Twitch checks the entire frame chain, including the desktop's app iframe.
    for (const origin of Array.from(location.ancestorOrigins || [])) addParent(origin);
    let frame = window;
    while (frame !== frame.parent) {
        try { frame = frame.parent; addParent(frame.location.href); }
        catch { break; }
    }
    if (window !== window.parent) addParent(document.referrer);

    if (!parents.size) {
        const status = document.getElementById('twitch-embed-status');
        status.textContent = 'Open this page on the website or a local web server to load Twitch. You can also use OPEN TWITCH below.';
        status.hidden = false;
        return;
    }

    const player = new URL('https://player.twitch.tv/');
    player.searchParams.set('channel', channel);
    player.searchParams.set('autoplay', 'true');
    // Muted playback is eligible for autoplay; Twitch's controls enable sound.
    player.searchParams.set('muted', 'true');
    const chat = new URL(`https://www.twitch.tv/embed/${channel}/chat`);
    chat.searchParams.set('darkpopout', '');
    for (const parent of parents) {
        player.searchParams.append('parent', parent);
        chat.searchParams.append('parent', parent);
    }
    document.getElementById('twitch-player').src = player.href;
    document.getElementById('twitch-chat').src = chat.href;
})();
