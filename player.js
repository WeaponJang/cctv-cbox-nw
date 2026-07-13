// 获取 URL 中的视频地址
var url = window.location.href.split("#")[1];

if (!url) {
    document.querySelector('.artplayer-app').innerHTML = '未检测到视频地址';
} else {
    // 自动检测类型
    var type = 'auto'; // 默认 auto，artplayer 会尝试自动识别
    if (url.indexOf('.m3u8') > -1) type = 'm3u8';
    if (url.indexOf('.flv') > -1) type = 'flv';
	let liveType = type == "flv" ? true : false;
    var art = new Artplayer({
        container: '.artplayer-app',
        url: url,
        title: '正在播放',
        volume: 0.7,
        isLive: liveType, 
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: true,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: true,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        theme: '#23ade5',
        lang: 'zh-cn',
        // 配置自定义类型处理
        customType: {
            m3u8: function (video, url) {
                // 这里使用 hls.js
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            },
            flv: function (video, url) {
                if (mpegts.isSupported()) {
                    var mpegtsPlayer = mpegts.createPlayer({
                        type: 'flv',
                        url: url,
                    });
                    mpegtsPlayer.attachMediaElement(video);
                    mpegtsPlayer.load();
                } else {
                    art.notice.show = '不支持播放当前流格式';
                }
            },
        },
    });

    // 可选：监听事件
    art.on('video:canplay', function () {
        console.log('视频可以播放');
    });
}
