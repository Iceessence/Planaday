// Offline Web Audio Synthesized Ambient Soundscapes, Alarm Volume Ramp & Chimes (Section 10.02, 10.03, 10.04)

export type SoundscapeChannel = 'brown' | 'pink' | 'white' | 'rain' | 'cafe' | 'lofi';

class OfflineAudioEngine {
  private ctx: AudioContext | null = null;
  private channels = new Map<SoundscapeChannel, { stop: () => void; gain: GainNode }>();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playChime(type: 'soft' | 'bell' | 'complete' = 'soft', volume = 0.25) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = type === 'complete' ? [523.25, 659.25, 783.99] : type === 'bell' ? [880, 660] : [587.33];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(volume, now + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.6);
    });
  }

  public speakStep(text: string) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.96;
        window.speechSynthesis.speak(u);
      } catch {
        this.playChime('bell');
      }
    } else {
      this.playChime('bell');
    }
  }

  public setChannelVolume(channel: SoundscapeChannel, volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    const existing = this.channels.get(channel);

    if (clamped <= 0.005) {
      if (existing) {
        const ctx = this.ctx;
        if (ctx) {
          existing.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
          setTimeout(() => existing.stop(), 350);
        } else {
          existing.stop();
        }
        this.channels.delete(channel);
      }
      return;
    }

    if (existing && this.ctx) {
      existing.gain.gain.setTargetAtTime(clamped * 0.35, this.ctx.currentTime, 0.12);
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.setTargetAtTime(clamped * 0.35, ctx.currentTime, 0.25);
    gain.connect(ctx.destination);

    if (channel === 'lofi') {
      // Gentle warm analog Rhodes-like chord drone
      const freqs = [220, 261.63, 329.63, 392];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      filter.connect(gain);
      const oscs = freqs.map((f) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.connect(filter);
        o.start();
        return o;
      });
      this.channels.set(channel, {
        gain,
        stop: () => oscs.forEach((o) => { try { o.stop(); } catch { /* noop */ } }),
      });
      return;
    }

    // Synthesize 3-second seamless noise buffer (White, Pink, Brown, Rain, Cafe)
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    let b0 = 0, b1 = 0, b2 = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (channel === 'white') {
        data[i] = white * 0.45;
      } else if (channel === 'brown' || channel === 'cafe') {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 2.8;
      } else {
        // Pink / Rain
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.14;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    if (channel === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.6;
    } else if (channel === 'cafe') {
      filter.type = 'lowpass';
      filter.frequency.value = 420;
    } else if (channel === 'brown') {
      filter.type = 'lowpass';
      filter.frequency.value = 300;
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 4800;
    }

    src.connect(filter);
    filter.connect(gain);
    src.start();

    this.channels.set(channel, {
      gain,
      stop: () => {
        try {
          src.stop();
        } catch {
          // ignore
        }
      },
    });
  }

  public stopAll() {
    for (const ch of Array.from(this.channels.keys())) {
      this.setChannelVolume(ch, 0);
    }
  }
}

export const audioEngine = new OfflineAudioEngine();
