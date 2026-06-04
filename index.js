const { exec, spawn } = require('child_process'); 
const fs = require('fs'); 
const fsp = fs.promises; 
const path = require('path'); 
const https = require('https'); 
const http = require('http'); // 新增引入 http 模块
const appDir = process.cwd(); 
const childProcesses = new Set(); 
let isRunning = false; 
let stopBtn, startBtn, logOutput, inputGuid; 

// 日志输出封装：自动追加并滚动到底部
function appendLog(msg) { 
    if (!logOutput) return; 
    logOutput.textContent += msg; 
    // 自动滚动到底部
    logOutput.scrollTop = logOutput.scrollHeight; 
} 

function init() { 
    stopBtn = document.getElementById('stopBtn'); 
    startBtn = document.getElementById('startBtn'); 
    logOutput = document.getElementById('logOutput'); 
    inputGuid = document.getElementById('inputGuid'); 
    if (stopBtn) stopBtn.addEventListener('click', stopProcess); 
    if (startBtn) startBtn.addEventListener('click', run); 
    if (logOutput) logOutput.textContent = 'CCTV 视频下载器已就绪'; 
} 

if (document.readyState === 'loading') { 
    document.addEventListener('DOMContentLoaded', init); 
} else { 
    init(); 
} 

async function run() { 
    try { 
        const guid = await getGuid(); 
        if (!guid) { 
            console.error('❌ 错误: 未提供有效的 guid'); 
            appendLog('\n❌ 错误: 未提供有效的 guid'); 
            return; 
        } 
        setButtonState(true); 
        const startTime = Date.now(); 
        await main(guid); 
        console.log('✅ 所有任务完成！'); 
        const totalTime = (Date.now() - startTime) / 1000; 
        appendLog('\n✅ 所有任务完成！'); 
        appendLog(`\n总耗时: ${totalTime.toFixed(2)}秒`); 
        setButtonState(false); 
    } catch (err) { 
        console.error('💥 流程失败:', err.message || err); 
        appendLog('\n💥 流程失败: ' + err.message); 
    } 
} 

async function getGuid() { 
    if (inputGuid) { 
        const argGuid = inputGuid.value.trim(); 
        if (argGuid) { 
            console.log(`📌 检测到 guid: ${argGuid}`); 
            return argGuid; 
        } 
    } 
    return "6782ab8382cd4307923de0e47b8f4808"; 
} 

function runCommand(cmd) { 
    console.log('▶️ 执行:', cmd); 
    appendLog('\n▶️ 执行: ' + cmd); 
    return new Promise((resolve, reject) => { 
        const proc = exec(cmd); 
        let stderr = ''; 
        proc.stderr?.on('data', d => stderr += d.toString()); 
        proc.on('error', reject); 
        proc.on('close', code => { 
            if (code === 0) resolve(); 
            else reject(new Error(`命令失败（退出码 ${code}）\n${stderr}`)); 
        }); 
    }); 
} 

function runFfmpeg(args) { 
    const ffPath = path.join(appDir, "bin", "ffmpeg.exe"); 
    const cmd = `"${ffPath}" -hide_banner -stats -v panic ${args}`; 
    return runCommand(cmd); 
} 

// 使用cbox.exe解密文件（分片或完整均可）
async function decryptCombinedFile(encryptedPath, outputPath) { 
    const cboxExePath = path.join(appDir, "bin", "cbox.exe"); 
    if (!(await fileExists(cboxExePath))) { 
        throw new Error(`cbox.exe 工具未找到，请确保它在当前目录: ${appDir}`); 
    } 
    return new Promise((resolve, reject) => { 
        const child = spawn(cboxExePath, [encryptedPath, outputPath], { cwd: appDir, stdio: 'inherit' }); 
        childProcesses.add(child); 
        console.log(`解密文件中: ${encryptedPath}`); 
        appendLog(`\n正在解密: ${path.basename(encryptedPath)}`); 
        child.on('error', (err) => { 
			if (err.code > 500){
				childProcesses.delete(child); 
				console.error('启动解密进程失败: ' + err.message); 
				reject(err); 
            }
        }); 
        child.on('close', (code) => { 
            childProcesses.delete(child); 
            if (code > 100) { 
                console.error("解密失败,退出码:" + code); 
                reject(new Error(`cbox.exe 解密失败 (退出码 ${code})`)); 
            } else { 
                console.log(`✅ 解密完成: ${outputPath}`); 
                resolve(outputPath); 
            } 
        }); 
    }); 
} 

// 检查文件是否存在 
async function fileExists(filePath) { 
    try { 
        await fsp.access(filePath); 
        return true; 
    } catch { 
        return false; 
    } 
}

// 新增：获取m3u8内容，自动处理重定向
async function fetchM3U8(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const options = url.startsWith('https') ? { rejectUnauthorized: false } : {};
        mod.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const location = new URL(res.headers.location, url).href;
                return fetchM3U8(location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ content: data, finalUrl: url }));
        }).on('error', reject);
    });
}

// 新增：解析m3u8提取ts分片链接
function parseTsUrls(m3u8Content, m3u8Url) {
    const lines = m3u8Content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    return lines.map(line => {
        if (line.startsWith('http')) return line;
        const m3u8Dir = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        return new URL(line, m3u8Dir).href;
    });
}

// 新增：下载单个ts分片文件
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        // enc2接口的cdn在下载时需要关闭TLS验证
        const options = url.startsWith('https') ? { rejectUnauthorized: false } : {};
        mod.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const location = new URL(res.headers.location, url).href;
                return downloadFile(location, destPath).then(resolve).catch(reject);
            }
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => { stream.close(); resolve(); });
            stream.on('error', reject);
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// 修改核心逻辑：先解密分片，再合并
async function main(guid) { 
    const cdn = "drm.cntv.vod.dnsv1.com"; 
    const m3u8Url = `http://${cdn}/asp/enc2/hls/2000/0303000a/3/default/${guid}/2000.m3u8`; 
    const outputDir = path.join(appDir, `${guid}`); 
    const finalOutput = path.join(appDir, "..", "videos", `${guid}.mp4`); 

    await fsp.mkdir(outputDir, { recursive: true }); 
    await fsp.mkdir(path.dirname(finalOutput), { recursive: true }); 

    // 1. 获取并解析m3u8列表
    appendLog('<br>1. 开始获取m3u8下载列表...'); 
    const { content, finalUrl } = await fetchM3U8(m3u8Url);
    const tsUrls = parseTsUrls(content, finalUrl);
    appendLog(`\n共发现 ${tsUrls.length} 个ts分片`); 

    // 2. 逐个下载并解密ts分片
    appendLog('<br>2. 开始逐个下载并解密ts分片...'); 
    const decTsPaths = [];
    for (let i = 0; i < tsUrls.length; i++) {
        const encTsPath = path.join(outputDir, `${String(i).padStart(5, '0')}.ts`);
        const decTsPath = path.join(outputDir, `${String(i).padStart(5, '0')}_dec.ts`);

        appendLog(`\n▶️ 下载分片 ${i + 1}/${tsUrls.length}...`);
        await downloadFile(tsUrls[i], encTsPath);

        appendLog(` -> 解密中...`);
        await decryptCombinedFile(encTsPath, decTsPath);
        decTsPaths.push(decTsPath);

        // 下载并解密完成后，清理加密的ts分片以节省磁盘空间
        await fsp.unlink(encTsPath).catch(() => {});
    }

    // 3. 将所有解密后的ts文件合成为mp4
    appendLog('<br>3. 开始合并解密后的分片为mp4...'); 
    const concatListPath = path.join(outputDir, 'concat.txt'); 
    const concatContent = decTsPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'); 
    await fsp.writeFile(concatListPath, concatContent, 'utf-8'); 

    await runFfmpeg(`-f concat -safe 0 -i "${concatListPath}" -c copy "${finalOutput}"`); 

    appendLog(`<br>✅ 合并完成: ${finalOutput}`); 

    // 尝试获取视频标题并重命名 
    const api = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?client=flash&im=0&pid=${guid}`; 
    try { 
        const json = await new Promise((resolve, reject) => { 
            https.get(api, (res) => { 
                let data = ''; 
                res.on('data', (chunk) => { data += chunk; }); 
                res.on('end', () => { 
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); } 
                }); 
            }).on('error', reject); 
        }); 
        const orgtitle = json.title; 
        const title = safeName(orgtitle); 
        const dest = path.join(path.dirname(finalOutput), `${title}.mp4`); 
        await fsp.rename(finalOutput, dest); 
        appendLog(`<br>🏷️ 文件重命名为: ${title}.mp4`); 
    } catch (err) { 
        console.error('请求失败:', err.message); 
        appendLog(`<br>⚠️ 使用原始GUID命名: ${guid}.mp4`); 
    } 

    // 清理临时目录 
    await fsp.rm(outputDir, { recursive: true, force: true }); 
    appendLog('<br>🧹 临时目录已清理'); 
} 

function safeName(title) { 
    const maxLength = 150; 
    const allowedPattern = new RegExp( 
        '[^' + '\\u002D' + '\\u005F' + '\\u300C-\\u300F' + '\\u0030-\\u0039' + '\\u0041-\\u005A' + '\\u0061-\\u007A' + '\\u4E00-\\u9FFF' + ']', 
        'g' 
    ); 
    let safe = title.replace(allowedPattern, '_'); 
    safe = safe.trim().replace(/^\.+|\.+$/g, ''); 
    if (!safe || /^_+$/.test(safe)) safe = 'video'; 
    if (safe.length > maxLength) safe = safe.substring(0, maxLength); 
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe)) { 
        safe = '_' + safe; 
    } 
    return safe; 
} 

async function stopProcess() { 
    if (childProcesses.size > 0) { 
        appendLog('<br>正在停止所有进程...'); 
        childProcesses.forEach(child => { 
            try { 
                child.kill('SIGTERM'); 
            } catch (e) { 
                console.error("停止进程失败", e); 
            } 
        }); 
        childProcesses.clear(); 
    } 
    const guid = inputGuid ? inputGuid.value.trim() : null; 
    if (guid) { 
        const testDir = path.join(appDir, guid); 
        try { 
            const files = await fsp.readdir(testDir); 
            let deletedCount = 0; 
            for (const file of files) { 
                try { 
                    await fsp.unlink(path.join(testDir, file)); 
                    deletedCount++; 
                } catch (err) { } 
            } 
            await fsp.rm(testDir, { recursive: true, force: true }); 
            appendLog(`\n已清理中间目录，删除文件: ${deletedCount} 个`); 
        } catch (err) { 
            if (err.code !== 'ENOENT') { 
                appendLog(`\n清理出错: ${err.message}`); 
            } 
        } 
    } 
    setButtonState(false); 
} 

function setButtonState(running) { 
    isRunning = running; 
    if (stopBtn) stopBtn.disabled = !running; 
    if (startBtn) startBtn.disabled = running; 
}
