# cctv-cbox-nw
### 本项目的出发点是将52pj网上的大神开发的cbox解密工具封装成一个nwjs应用,
### 因cbox只支持Windows系统,所以本项目也只支持Windows

### 运行本项目需要nwjs的SDK和52pj网的大神开发的cbox.exe,以及开源项目ffmpeg的可执行文件ffmpeg.exe,
### 本项目中的文件需要放到package.nw文件夹里
确保package.nw里的文件结构如下所示:

+ bin *
+ index.html
+ index.js
+ package.json
+ UDRM_LICENSE.v1.0 *

### 其中标注了 * 号的部分需要用户从52pj网上找到名为cbox.exe的可执行文件和开源项目ffmpeg的可执行文件ffmpeg.exe,
### cbox.exe和ffmpeg.exe以及调用到的dll文件都需要放到bin文件夹下, 其中 UDRM_LICENSE.v1.0 这个文件要放到bin文件夹外面

### nwjs的SDK目录下包含一个nw.exe程序,将package.nw文件夹放在nw.exe的同级文件夹里,
+ nw-app
+ ◟ nw.exe
+ ◟ package.nw

## ~~ 双击运行nw.exe即可使用
