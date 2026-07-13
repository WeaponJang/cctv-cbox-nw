document.addEventListener('click', function (e) {
    if (e.target.href) {
        var href = e.target.href;
        // 获取去除参数和锚点的基础链接
        var baseUrl = href.split('?')[0].split('#')[0];
        
        // 检查是否为 m3u8 或 flv 结尾
        if (baseUrl.endsWith(".m3u8") || baseUrl.endsWith(".flv")) {
            e.preventDefault();
            e.stopPropagation();
            // 发送消息给后台，命令名称保持不变或根据需要修改
            chrome.runtime.sendMessage({command: 'CMD_PLAY_M3U8', url: href}, function (response) {});
        }
    }
});
