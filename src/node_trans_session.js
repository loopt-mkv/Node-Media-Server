//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');

const isHlsFile = (filename) => filename.endsWith('.ts') || filename.endsWith('.m3u8')
const isTemFiles = (filename) => filename.endsWith('.mpd') || filename.endsWith('.m4s') || filename.endsWith('.tmp')

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.getConfig = (key = null) => {
      if (!key) return
      if (typeof this.conf != 'object') return
      if (this.conf.args && typeof this.conf.args === 'object' && this.conf.args[key]) return this.conf.args[key]
      return this.conf[key]
    }
  }

  run() {
    let vc = this.conf.vc || 'copy';
    let ac = this.conf.ac || 'copy';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    let mapStr = '';
    let filename

    if (this.conf.rtmp && this.conf.rtmpApp) {
      if (this.conf.rtmpApp === this.conf.streamApp) {
        Logger.error('[Transmuxing RTMP] Cannot output to the same app.');
      } else {
        let rtmpOutput = `rtmp://127.0.0.1:${this.conf.rtmpPort}/${this.conf.rtmpApp}/${this.conf.streamName}`;
        mapStr += `[f=flv]${rtmpOutput}|`;
        Logger.log('[Transmuxing RTMP] ' + this.conf.streamPath + ' to ' + rtmpOutput);
      }
    }
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM-ss') + '.mp4';
      filename = mp4FileName
      let mapMp4 = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.mkv) {
      this.conf.mkvFlags = this.conf.mkvFlags ? this.conf.mkvFlags : '';
      let mkvFileName = dateFormat('yyyy-mm-dd-HH-MM-ss') + '.mkv';
      filename = mkvFileName
      let mapMkv = `${this.conf.mkvFlags}${ouPath}/${mkvFileName}|`;
      mapStr += mapMkv;
      Logger.log('[Transmuxing MKV] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mkvFileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.getConfig('hlsFlags') || '';
      let hlsFileName = 'index.m3u8';
      filename = hlsFileName
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      filename = dashFileName
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    mkdirp.sync(ouPath);
    let argv = ['-y', '-i', inPath];
    Array.prototype.push.apply(argv, ['-c:v', vc]);
    Array.prototype.push.apply(argv, this.conf.vcParam);
    Array.prototype.push.apply(argv, ['-c:a', ac]);
    Array.prototype.push.apply(argv, this.conf.acParam);
    Array.prototype.push.apply(argv, ['-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr]);
    argv = argv.filter((n) => { return n; }); //去空

    console.log('this.conf', this.conf)
    if (this.conf['onFileNameAssigned']) {
      argv = this.conf['onFileNameAssigned'](this.conf, filename, argv)
    }

    console.log('argv', argv)

    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    if (this.conf['onSpawn']) {
      this.conf['onSpawn'](this.ffmpeg_exec, this.conf, argv, filename)
    }
    this.ffmpeg_exec.on('error', (e) => {
      Logger.log(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      // Logger.log(`FF输出：${data.toString()}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      // Logger.log(`FF输出 stderr：${data.toString()}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');
      this.cleanTempFiles(ouPath)
      this.deleteHlsFiles(ouPath)
    });
  }

  end() {
    this.ffmpeg_exec.kill();
  }

  // delete hls files
  deleteHlsFiles (ouPath) {
    if ((!ouPath && !this.conf.hls) || this.getConfig('hlsKeep')) return
    fs.readdir(ouPath, function (err, files) {
      if (err) return
      files.filter((filename) => isHlsFile(filename)).forEach((filename) => {
        fs.unlinkSync(`${ouPath}/${filename}`);
      });
    });
  }

  // delete the other files
  cleanTempFiles (ouPath) {
    if (!ouPath) return
    fs.readdir(ouPath, function (err, files) {
      if (err) return
      files.filter((filename) => isTemFiles(filename)).forEach((filename) => {
        fs.unlinkSync(`${ouPath}/${filename}`);
      });
    });
  }
}

module.exports = NodeTransSession;