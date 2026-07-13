function play_url(url) { 
    var playerUrl = chrome.runtime.getURL('player.html') + "#" + url; 
    chrome.tabs.create({url: playerUrl}); 
}

document.addEventListener('DOMContentLoaded', function () {
    var btnPlay = document.getElementById('btn_play');
    if (btnPlay) {
        btnPlay.addEventListener('click', function () {
            var urlInput = document.getElementById('url');
            if (urlInput && urlInput.value) {
                play_url(urlInput.value);
            }
        });
    }
});
