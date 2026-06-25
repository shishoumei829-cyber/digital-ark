'use strict';

/**
 * TTS — 可选 GPT-SoVITS 代理，降级为浏览器合成指引
 */

class TTSService {
  constructor(sovitsUrl, refAudio) {
    this.sovitsUrl = (sovitsUrl || process.env.SOVITS_URL || 'http://127.0.0.1:9880').replace(/\/$/, '');
    this.refAudio = refAudio || process.env.SOVITS_REF || '';
    this.lastCheck = 0;
    this.available = false;
  }

  async checkStatus() {
    if (Date.now() - this.lastCheck < 10000) {
      return { status: this.available ? 'connected' : 'browser_fallback', url: this.sovitsUrl };
    }
    this.lastCheck = Date.now();
    try {
      const res = await fetch(this.sovitsUrl, { method: 'GET', signal: AbortSignal.timeout(2000) });
      this.available = res.ok || res.status === 404;
    } catch {
      this.available = false;
    }
    return {
      status: this.available ? 'connected' : 'browser_fallback',
      url: this.sovitsUrl,
      message: this.available ? 'GPT-SoVITS 可用' : '使用浏览器语音合成'
    };
  }

  async synthesize(text, options = {}) {
    const status = await this.checkStatus();
    if (!this.available) {
      return { mode: 'browser', text, voice_hint: options.voice || 'zh-CN' };
    }

    try {
      const params = new URLSearchParams({
        text: String(text).slice(0, 500),
        text_language: 'zh'
      });
      if (this.refAudio) params.set('refer_wav_path', this.refAudio);

      const url = `${this.sovitsUrl}/?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error('TTS 请求失败');

      const buf = Buffer.from(await res.arrayBuffer());
      return {
        mode: 'audio',
        mime: 'audio/wav',
        audio: buf.toString('base64'),
        text
      };
    } catch (err) {
      return { mode: 'browser', text, error: err.message };
    }
  }
}

module.exports = { TTSService };
