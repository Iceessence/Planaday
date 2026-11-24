// Offline Web Audio Synthesized Ambient Soundscapes, Alarm Ringtones, Custom Blob Audio & Chimes
import { getBlobObjectUrl } from './db';
import type { AlarmRingtoneId } from './alarmSchedule';

export type SoundscapeChannel = 'brown' | 'pink' | 'white' | 'rain' | 'cafe' | 'lofi';

export interface AlarmRingtoneDef {
  id: AlarmRingtoneId;
  name: string;
  emoji: string;
  description: string;
  loopIntervalMs: number;
}

export const ALARM_RINGTONES: AlarmRingtoneDef[] = [
  { id: 'sunrise_harp', name: 'Sunrise Harp', emoji: '🌅', description: 'Warm ascending harp arpeggio', loopIntervalMs: 2600 },
  { id: 'classic_bell', name: 'Classic Twin Bell', emoji: '🔔', description: 'Crisp nostalgic double-ring bell', loopIntervalMs: 2100 },
  { id: 'radar_pulse', name: 'Radar Pulse', emoji: '📡', description: 'Modern rhythmic smartphone pulse', loopIntervalMs: 2000 },
  { id: 'morning_chimes', name: 'Morning Chimes', emoji: '🎐', description: 'Peaceful pentatonic wind chimes', loopIntervalMs: 2800 },
  { id: 'retro_digital', name: 'Retro Bedside Beep', emoji: '📟', description: 'Classic digital 4-beep clock', loopIntervalMs: 1800 },
  { id: 'bright_marimba', name: 'Bright Marimba', emoji: '🎵', description: 'Cheerful upbeat wake-up melody', loopIntervalMs: 2400 },
  { id: 'zen_bowl', name: 'Zen Singing Bowl', emoji: '🪷', description: 'Deep resonant temple harmonic', loopIntervalMs: 3200 },
  { id: 'urgent_siren', name: 'Urgent Wake Alert', emoji: '🚨', description: 'High-contrast dual-tone wake-up', loopIntervalMs: 1700 },
];

export function getRingtoneLabel(ringtoneId?: string, customName?: string): string {
  if (!ringtoneId) return '🌅 Sunrise Harp';
  if (ringtoneId.startsWith('blob:')) return `🎶 ${customName || 'Custom Audio'}`;
  const found = ALARM_RINGTONES.find((r) => r.id === ringtoneId);
  return found ? `${found.emoji} ${found.name}` : '🌅 Sunrise Harp';
}

type ToneDef = { freq: number; delay: number; dur: number; wave: OscillatorType; gainMul?: number };

const RINGTONE_PATTERNS: Record<AlarmRingtoneId, ToneDef[]> = {
  sunrise_harp: [
    { freq: 392.0, delay: 0.0, dur: 0.55, wave: 'sine' },
    { freq: 493.88, delay: 0.16, dur: 0.55, wave: 'sine' },
    { freq: 587.33, delay: 0.32, dur: 0.6, wave: 'sine' },
    { freq: 739.99, delay: 0.48, dur: 0.65, wave: 'sine' },
    { freq: 783.99, delay: 0.66, dur: 0.9, wave: 'triangle' },
    { freq: 987.77, delay: 0.86, dur: 1.0, wave: 'sine' },
  ],
  classic_bell: [
    { freq: 1180, delay: 0.0, dur: 0.11, wave: 'triangle' },
    { freq: 1480, delay: 0.09, dur: 0.11, wave: 'triangle' },
    { freq: 1180, delay: 0.18, dur: 0.11, wave: 'triangle' },
    { freq: 1480, delay: 0.27, dur: 0.11, wave: 'triangle' },
    { freq: 1180, delay: 0.36, dur: 0.11, wave: 'triangle' },
    { freq: 1480, delay: 0.45, dur: 0.14, wave: 'triangle' },
    { freq: 1180, delay: 0.85, dur: 0.11, wave: 'triangle' },
    { freq: 1480, delay: 0.94, dur: 0.11, wave: 'triangle' },
    { freq: 1180, delay: 1.03, dur: 0.11, wave: 'triangle' },
    { freq: 1480, delay: 1.12, dur: 0.15, wave: 'triangle' },
  ],
  radar_pulse: [
    { freq: 880, delay: 0.0, dur: 0.12, wave: 'sawtooth', gainMul: 0.55 },
    { freq: 1318.5, delay: 0.14, dur: 0.12, wave: 'sawtooth', gainMul: 0.55 },
    { freq: 880, delay: 0.28, dur: 0.12, wave: 'sawtooth', gainMul: 0.55 },
    { freq: 1318.5, delay: 0.42, dur: 0.12, wave: 'sawtooth', gainMul: 0.55 },
    { freq: 880, delay: 0.72, dur: 0.12, wave: 'sawtooth', gainMul: 0.55 },
    { freq: 1318.5, delay: 0.86, dur: 0.22, wave: 'sawtooth', gainMul: 0.55 },
  ],
  morning_chimes: [
    { freq: 523.25, delay: 0.0, dur: 0.7, wave: 'sine' },
    { freq: 659.25, delay: 0.22, dur: 0.7, wave: 'sine' },
    { freq: 783.99, delay: 0.44, dur: 0.75, wave: 'sine' },
    { freq: 1046.5, delay: 0.7, dur: 0.9, wave: 'sine' },
    { freq: 880.0, delay: 1.05, dur: 0.85, wave: 'sine' },
    { freq: 1174.66, delay: 1.35, dur: 0.95, wave: 'sine' },
  ],
  retro_digital: [
    { freq: 1040, delay: 0.0, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 0.15, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 0.3, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 0.45, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 0.88, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 1.03, dur: 0.1, wave: 'square', gainMul: 0.42 },
    { freq: 1040, delay: 1.18, dur: 0.1, wave: 'square', gainMul: 0.42 },
  ],
  bright_marimba: [
    { freq: 523.25, delay: 0.0, dur: 0.22, wave: 'triangle' },
    { freq: 659.25, delay: 0.16, dur: 0.22, wave: 'triangle' },
    { freq: 783.99, delay: 0.32, dur: 0.22, wave: 'triangle' },
    { freq: 659.25, delay: 0.48, dur: 0.2, wave: 'triangle' },
    { freq: 880.0, delay: 0.66, dur: 0.26, wave: 'triangle' },
    { freq: 1046.5, delay: 0.88, dur: 0.5, wave: 'triangle' },
  ],
  zen_bowl: [
    { freq: 261.63, delay: 0.0, dur: 2.3, wave: 'sine', gainMul: 0.85 },
    { freq: 523.25, delay: 0.02, dur: 1.9, wave: 'sine', gainMul: 0.45 },
    { freq: 784.88, delay: 0.04, dur: 1.5, wave: 'sine', gainMul: 0.22 },
  ],
  urgent_siren: [
    { freq: 960, delay: 0.0, dur: 0.2, wave: 'square', gainMul: 0.45 },
    { freq: 1280, delay: 0.22, dur: 0.2, wave: 'square', gainMul: 0.45 },
    { freq: 960, delay: 0.44, dur: 0.2, wave: 'square', gainMul: 0.45 },
    { freq: 1280, delay: 0.66, dur: 0.2, wave: 'square', gainMul: 0.45 },
    { freq: 1440, delay: 0.92, dur: 0.32, wave: 'sawtooth', gainMul: 0.5 },
  ],
};

class OfflineAudioEngine {
  private ctx: AudioContext | null = null;
  private channels = new Map<SoundscapeChannel, { stop: () => void; gain: GainNode }>();
  private alarmIntervalId: number | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playToneSequence(notes: ToneDef[], volume: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const clampedVol = Math.max(0.01, Math.min(1, volume));
    const now = ctx.currentTime;

    notes.forEach(({ freq, delay, dur, wave, gainMul }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      const defaultMul = wave === 'square' ? 0.38 : 0.72;
      const peakGain = clampedVol * (gainMul ?? defaultMul);
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.005, peakGain), now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.04);
    });
  }

  public playChime(
    type: 'soft' | 'bell' | 'complete' | 'marimba' | 'classic_alarm' | 'woodblock' | 'bright' = 'soft',
    volume = 0.45
  ) {
    const patterns: Record<string, ToneDef[]> = {
      soft: [{ freq: 587.33, delay: 0, dur: 0.55, wave: 'sine' }],
      bell: [
        { freq: 880, delay: 0, dur: 0.55, wave: 'sine' },
        { freq: 659.25, delay: 0.14, dur: 0.65, wave: 'sine' },
      ],
      complete: [
        { freq: 523.25, delay: 0, dur: 0.4, wave: 'sine' },
        { freq: 659.25, delay: 0.12, dur: 0.4, wave: 'sine' },
        { freq: 783.99, delay: 0.24, dur: 0.65, wave: 'sine' },
      ],
      marimba: [
        { freq: 440, delay: 0, dur: 0.28, wave: 'triangle' },
        { freq: 554.37, delay: 0.11, dur: 0.28, wave: 'triangle' },
        { freq: 659.25, delay: 0.22, dur: 0.35, wave: 'triangle' },
        { freq: 880, delay: 0.34, dur: 0.55, wave: 'triangle' },
      ],
      classic_alarm: [
        { freq: 920, delay: 0, dur: 0.14, wave: 'square' },
        { freq: 920, delay: 0.18, dur: 0.14, wave: 'square' },
        { freq: 920, delay: 0.36, dur: 0.14, wave: 'square' },
        { freq: 920, delay: 0.64, dur: 0.14, wave: 'square' },
        { freq: 920, delay: 0.82, dur: 0.14, wave: 'square' },
      ],
      woodblock: [
        { freq: 760, delay: 0, dur: 0.11, wave: 'triangle' },
        { freq: 1020, delay: 0.14, dur: 0.13, wave: 'triangle' },
      ],
      bright: [
        { freq: 659.25, delay: 0, dur: 0.22, wave: 'sine' },
        { freq: 880, delay: 0.11, dur: 0.22, wave: 'sine' },
        { freq: 1174.66, delay: 0.22, dur: 0.55, wave: 'sine' },
      ],
    };

    this.playToneSequence(patterns[type] ?? patterns.bell, volume);
  }

  /**
   * Plays a single preview burst of any built-in musical ringtone OR a custom uploaded audio blob (`blob:<hash>`).
   */
  public async playRingtoneOnce(ringtoneId = 'sunrise_harp', volume = 0.75): Promise<void> {
    const clampedVol = Math.max(0.02, Math.min(1, volume));
    if (ringtoneId.startsWith('blob:')) {
      const hash = ringtoneId.slice(5);
      const url = await getBlobObjectUrl(hash);
      if (url && typeof Audio !== 'undefined') {
        this.stopAlarmLoop();
        this.activeObjectUrl = url;
        const audio = new Audio(url);
        audio.volume = clampedVol;
        this.activeHtmlAudio = audio;
        try {
          await audio.play();
          return;
        } catch {
          // fallback to synth if autoplay blocked
        }
      }
    }
    const key = (ringtoneId in RINGTONE_PATTERNS ? ringtoneId : 'sunrise_harp') as AlarmRingtoneId;
    this.playToneSequence(RINGTONE_PATTERNS[key], clampedVol);
  }

  /**
   * Starts a continuous looping alarm ringtone with gradual volume ramp-in until stopAlarmLoop() is called.
   */
  public startAlarmLoop(ringtoneId = 'sunrise_harp', targetVolume = 0.85, rampSec = 20): void {
    this.stopAlarmLoop();
    const clampedTarget = Math.max(0.05, Math.min(1, targetVolume));
    const startedAt = Date.now();
    const rampMs = Math.max(1000, rampSec * 1000);

    if (ringtoneId.startsWith('blob:')) {
      const hash = ringtoneId.slice(5);
      void getBlobObjectUrl(hash).then((url) => {
        if (url && typeof Audio !== 'undefined') {
          this.activeObjectUrl = url;
          const audio = new Audio(url);
          audio.loop = true;
          audio.volume = Math.min(clampedTarget, Math.max(0.15, clampedTarget * 0.35));
          this.activeHtmlAudio = audio;
          audio.play().catch(() => {
            this.startSynthAlarmLoop('sunrise_harp', clampedTarget, rampMs, startedAt);
          });
          this.alarmIntervalId = window.setInterval(() => {
            if (!this.activeHtmlAudio) return;
            const progress = Math.min(1, (Date.now() - startedAt) / rampMs);
            this.activeHtmlAudio.volume = Math.min(clampedTarget, Math.max(0.15, clampedTarget * (0.25 + 0.75 * progress)));
          }, 800);
        } else {
          this.startSynthAlarmLoop('sunrise_harp', clampedTarget, rampMs, startedAt);
        }
      });
      return;
    }

    const key = (ringtoneId in RINGTONE_PATTERNS ? ringtoneId : 'sunrise_harp') as AlarmRingtoneId;
    this.startSynthAlarmLoop(key, clampedTarget, rampMs, startedAt);
  }

  private startSynthAlarmLoop(key: AlarmRingtoneId, targetVolume: number, rampMs: number, startedAt: number) {
    const def = ALARM_RINGTONES.find((r) => r.id === key) ?? ALARM_RINGTONES[0];
    const playStep = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / rampMs);
      const vol = Math.min(targetVolume, Math.max(0.12, targetVolume * (0.3 + 0.7 * progress)));
      this.playToneSequence(RINGTONE_PATTERNS[key], vol);
    };
    playStep();
    this.alarmIntervalId = window.setInterval(playStep, def.loopIntervalMs);
  }

  public stopAlarmLoop(): void {
    if (this.alarmIntervalId !== null) {
      window.clearInterval(this.alarmIntervalId);
      this.alarmIntervalId = null;
    }
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeHtmlAudio = null;
    }
    if (this.activeObjectUrl) {
      try {
        URL.revokeObjectURL(this.activeObjectUrl);
      } catch {
        // ignore
      }
      this.activeObjectUrl = null;
    }
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
    this.stopAlarmLoop();
    for (const ch of Array.from(this.channels.keys())) {
      this.setChannelVolume(ch, 0);
    }
  }
}

export const audioEngine = new OfflineAudioEngine();
