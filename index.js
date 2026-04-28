const { exec, spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const https = require('https');

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
    return "8528b2de72904f15a740383d3c1e9917";
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

async function processFilesParallel(files, processFn, maxConcurrency = 8) {
    const results = [];
    const executing = new Set();
    for (const file of files) {
        const promise = Promise.resolve().then(() => processFn(file));
        results.push(promise);
        executing.add(promise);
        promise.then(() => executing.delete(promise));
        if (executing.size >= maxConcurrency) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

// 二进制合并多个文件为一个文件
async function mergeFilesSequentially(filePaths, outputPath) {
    console.log(`开始合并 ${filePaths.length} 个文件到: ${outputPath}`);
    appendLog(`\n开始合并 ${filePaths.length} 个文件到: ${path.basename(outputPath)}`);
    
    const writeStream = fs.createWriteStream(outputPath);
    
    for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileBuffer = await fsp.readFile(filePath);
        await new Promise((resolve, reject) => {
            writeStream.write(fileBuffer, (err) => {
                if (err) {
                    writeStream.end();
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        
        // 显示进度
        if ((i + 1) % 10 === 0 || i === filePaths.length - 1) {
            const progress = Math.round(((i + 1) / filePaths.length) * 100);
            console.log(`合并进度: ${i + 1}/${filePaths.length} (${progress}%)`);
        }
    }
    
    writeStream.end();
    await new Promise((resolve) => writeStream.on('close', resolve));
    console.log(`✅ 文件合并完成: ${outputPath}`);
    return outputPath;
}

// 使用cbox.exe解密完整文件
async function decryptCombinedFile(encryptedPath, outputPath) {
    const cboxExePath = path.join(appDir, "bin", "cbox.exe");
    
    if (!(await fileExists(cboxExePath))) {
        throw new Error(`cbox.exe 工具未找到，请确保它在当前目录: ${appDir}`);
    }
    
    return new Promise((resolve, reject) => {
        const child = spawn(cboxExePath, [encryptedPath, outputPath], {
            cwd: appDir,
            stdio: 'inherit'
        });

        childProcesses.add(child);
        console.log(`解密完整文件中: ${encryptedPath}`);
        appendLog(`\n正在解密: ${path.basename(encryptedPath)}`);

        child.on('error', (err) => {
            childProcesses.delete(child);
            console.error('启动解密进程失败: ' + err.message);
            reject(err);
        });

        child.on('close', (code) => {
            childProcesses.delete(child);
            if (code !== 0) {
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

async function main(guid) {
    const cdn = "drm.cntv.vod.dnsv1.com";
    // dhls.cntv.baishancdnx.cn.bsgslb.cn
    const m3u8Url = `https://${cdn}/asp/enc2/hls/2000/0303000a/3/default/${guid}/2000.m3u8`;
    const outputDir = path.join(appDir, `${guid}`);
    const finalOutput = path.join(appDir, "..", "videos", `${guid}.mp4`);
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.mkdir(path.dirname(finalOutput), { recursive: true });
    const tsPath = path.join(outputDir, `${guid}.ts`);
    // enc2接口的cdn在下载时需要关闭TLS验证
    appendLog('<br>1. 开始下载m3u8链接到 .ts 文件...');
    await runFfmpeg(`-protocol_whitelist "http,https,tcp,tls,crypto" -tls_verify 0 -i "${m3u8Url}" -c copy -f mpegts ${tsPath}`);
    const tmpPath = path.join(outputDir, guid + '.cbox');
    // 将.ts的mprgts流文件改成.cbox后缀名
    appendLog('<br>2. 改后缀名,便于调试识别...');
    await fsp.rename(tsPath, tmpPath);
    // 解密合并后的完整文件
    appendLog('<br>3. 开始解密完整文件...');
    await decryptCombinedFile(tmpPath, finalOutput);
    // 解密完成
    appendLog(`<br>✅ 解密完成: ${finalOutput}`);

    // 清理临时加密文件
    appendLog('<br>🗑️ 清理临时加密文件...');
    await fsp.unlink(tmpPath).catch(() => {});
    
    // 尝试获取视频标题并重命名
    const api = `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?client=flash&im=0&pid=${guid}`;
    try {
        const json = await new Promise((resolve, reject) => {
            https.get(api, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } 
                    catch (e) { reject(e); }
                });
            }).on('error', reject);
        });

        const orgtitle = json.title;
        const title = safeName(orgtitle);
        // console.log('标题:', title);
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
        '[^' +
        '\\u002D' + '\\u005F' + 
        '\\u300C-\\u300F' + 
        '\\u0030-\\u0039' + 
        '\\u0041-\\u005A' + 
        '\\u0061-\\u007A' + 
        '\\u4E00-\\u9FFF' + 
        ']',
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