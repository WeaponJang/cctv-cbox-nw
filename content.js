// --- 原有的点击事件监听保持不变 ---
document.addEventListener('click', function(e) {
  const anchor = e.target.closest('a');
  if (!anchor || !anchor.href) return;

  try {
    const url = new URL(anchor.href);
    const pathname = url.pathname.toLowerCase();

    if (pathname.endsWith('.flv') || pathname.endsWith('.m3u8')) {
      e.preventDefault();
      e.stopPropagation();
      
      // 直接打开播放器页面，不再通过 background 消息，更直接
      const playerUrl = chrome.runtime.getURL('player.html') + "#" + encodeURIComponent(anchor.href);
      window.open(playerUrl, '_blank');
    }
  } catch (err) {
    console.warn('Invalid URL clicked:', anchor.href);
  }
});

// --- 新增：右键菜单功能 ---
// 创建一个右键菜单项
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "play-with-artplayer",
    title: "用 Artplayer 播放视频",
    contexts: ["link"]
  });
});

// 监听右键菜单的点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "play-with-artplayer" && info.linkUrl) {
    const urlLower = info.linkUrl.toLowerCase();
    if (urlLower.endsWith('.flv') || urlLower.endsWith('.m3u8')) {
      // 向 background script 发送消息
      chrome.runtime.sendMessage({
        command: 'playVideo',
        url: info.linkUrl
      });
    }
  }
});