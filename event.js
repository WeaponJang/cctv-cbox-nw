var enabled = true;

chrome.webRequest.onBeforeRequest.addListener(
    function (info) {
        // 简单的后缀检查
        var url = info.url.split("?")[0].split("#")[0];
        var isM3u8 = url.endsWith("m3u8");
        var isFlv = url.endsWith("flv");

        if (enabled && info.type == "main_frame" && (isM3u8 || isFlv)) {
            var playerUrl = chrome.runtime.getURL('player.html') + "#" + info.url;
            chrome.tabs.create({url: playerUrl}, ()=>{
                chrome.tabs.remove(info.tabId);
            });
            return {redirectUrl: playerUrl};
        }
    },
    {urls: ["<all_urls>"]},
    ["blocking"]
);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.command == 'CMD_PLAY_M3U8') {
        var playerUrl = chrome.runtime.getURL('player.html') + "#" + request.url;
        chrome.tabs.create({url: playerUrl});
    }
});
