// 监听来自其他脚本的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command == 'playVideo') {
    // 使用 # 号传递参数，避免编码问题
    var playerUrl = chrome.runtime.getURL('player.html') + "#" + encodeURIComponent(request.url);
    chrome.tabs.create({ url: playerUrl });
  }
});

// 监听所有网络请求，在请求发出前进行拦截
chrome.webRequest.onBeforeRequest.addListener(
  function(info) {
    const url = info.url.split("?")[0].split("#")[0].toLowerCase();
    // 拦截主框架请求中，以 .flv 或 .m3u8 结尾的链接
    if ((url.endsWith(".flv") || url.endsWith(".m3u8")) && info.type == "main_frame") {
      var playerUrl = chrome.runtime.getURL('player.html') + "#" + encodeURIComponent(info.url);
      return { redirectUrl: playerUrl };
    }
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
