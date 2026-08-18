"use client";

/**
 * Studio-Grade Ambient Audio Engine & Acoustic Mixer
 * 
 * Features:
 * - Real organic audio asset streaming & seamless buffer looping
 * - Master Dynamics Compressor + Warmth Filter (ear-fatigue protection)
 * - Gentle crossfading between tracks
 * - Multi-layer ambient gain mixing
 * - Live FFT frequency spectrum analyser
 */

export interface LayerGainMap {
  rain: number;
  cafe: number;
  keyboard: number;
  whitenoise: number;
}

const AMBIENT_LAYER_FILES: Record<keyof LayerGainMap, string> = {
  rain: "/audio/ambient/rain.ogg",
  cafe: "/audio/ambient/coffee-shop.ogg",
  keyboard: "/audio/ambient/keyboard.wav",
  whitenoise: "/audio/ambient/white-noise.ogg",
};

class AcousticsAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private warmthFilter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Buffer Cache to prevent re-fetching on loops/replays
  private bufferCache: Map<string, AudioBuffer> = new Map();

  // Active Main Track
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private activeTrackUrl: string | null = null;

  // Ambient Layer Nodes
  private layerGains: Record<keyof LayerGainMap, GainNode | null> = {
    rain: null,
    cafe: null,
    keyboard: null,
    whitenoise: null,
  };
  private layerSources: Record<keyof LayerGainMap, AudioBufferSourceNode | null> = {
    rain: null,
    cafe: null,
    keyboard: null,
    whitenoise: null,
  };

  private isEngineRunning = false;

  private initContext() {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Compressor (smooth dynamics, no volume clipping)
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      // Warmth Filter (soft high-shelf rolloff to prevent ear fatigue)
      this.warmthFilter = this.ctx.createBiquadFilter();
      this.warmthFilter.type = "lowpass";
      this.warmthFilter.frequency.setValueAtTime(12000, this.ctx.currentTime);

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

      // Analyser for real-time visualizer
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.82;

      // Audio Graph Routing:
      // Sources -> Master Compressor -> Warmth Filter -> Master Gain -> Analyser -> Output
      this.masterCompressor.connect(this.warmthFilter);
      this.warmthFilter.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Initialize ambient mixer buses
      this.setupAmbientBuses();
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  private setupAmbientBuses() {
    if (!this.ctx || !this.masterCompressor) return;

    const layers: (keyof LayerGainMap)[] = ["rain", "cafe", "keyboard", "whitenoise"];
    layers.forEach((layer) => {
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, this.ctx!.currentTime);
      gain.connect(this.masterCompressor!);
      this.layerGains[layer] = gain;
    });
  }

  // ─── Audio Buffer Loader ───────────────────────────────────

  private async loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.error(`Failed to load audio asset: ${url}`, err);
      return null;
    }
  }

  // ─── Main Soundscape Playback ───────────────────────────────

  public async playTrack(audioUrl: string, defaultVolume = 0.75) {
    this.initContext();
    if (!this.ctx || !this.masterCompressor) return;

    // Crossfade out previous track
    const oldSource = this.activeSource;
    const oldGain = this.activeGain;
    if (oldGain) {
      const now = this.ctx.currentTime;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0.001, now + 0.35);
      setTimeout(() => {
        try {
          if (oldSource) oldSource.stop();
          oldGain.disconnect();
        } catch (e) {}
      }, 400);
    }

    this.activeTrackUrl = audioUrl;
    const buffer = await this.loadAudioBuffer(audioUrl);
    if (!buffer || this.activeTrackUrl !== audioUrl) return;

    // Create new track source
    const newGain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    newGain.gain.setValueAtTime(0.001, now);
    newGain.gain.linearRampToValueAtTime(defaultVolume, now + 0.35);
    newGain.connect(this.masterCompressor);

    const newSource = this.ctx.createBufferSource();
    newSource.buffer = buffer;
    newSource.loop = true;
    newSource.connect(newGain);
    newSource.start(0);

    this.activeSource = newSource;
    this.activeGain = newGain;
    this.isEngineRunning = true;
  }

  public pause() {
    if (this.ctx && this.ctx.state === "running") {
      this.ctx.suspend();
      this.isEngineRunning = false;
    }
  }

  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
      this.isEngineRunning = true;
    }
  }

  public setMasterVolume(vol: number) {
    this.initContext();
    if (this.masterGain && this.ctx) {
      const normalized = Math.max(0, Math.min(1, vol / 100));
      this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.05);
    }
  }

  // ─── Ambient Layer Multi-Track Mixer ─────────────────────────

  public async setLayerVolume(layer: keyof LayerGainMap, vol: number) {
    this.initContext();
    if (!this.ctx) return;

    const gainNode = this.layerGains[layer];
    if (!gainNode) return;

    const normalized = Math.max(0, Math.min(1, vol / 100));
    gainNode.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.05);

    // If volume > 0 and layer not playing, start it
    if (normalized > 0 && !this.layerSources[layer]) {
      const filePath = AMBIENT_LAYER_FILES[layer];
      const buffer = await this.loadAudioBuffer(filePath);
      if (buffer && this.ctx) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gainNode);
        source.start(0);
        this.layerSources[layer] = source;
      }
    }
  }

  // ─── FFT Frequency Visualizer Spectrum ───────────────────────

  public getFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(16);
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  // ─── Procedural System Chimes ───────────────────────────────

  public playSystemChime(chimeId: string) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const chimeGain = this.ctx.createGain();
    chimeGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    chimeGain.connect(this.masterGain);

    const now = this.ctx.currentTime;

    if (chimeId === "system-ping") {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(1760, now);

      chimeGain.gain.setValueAtTime(0.85, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc1.connect(chimeGain);
      osc2.connect(chimeGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.5);
      osc2.stop(now + 1.5);
    } else if (chimeId === "cyber-chime") {
      [440, 554, 659].forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(chimeGain);
        osc.start(now);
        osc.stop(now + 1.2);
      });
      chimeGain.gain.setValueAtTime(0.7, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    } else if (chimeId === "sonar-radar") {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
      osc.connect(chimeGain);
      chimeGain.gain.setValueAtTime(0.9, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.start(now);
      osc.stop(now + 0.9);
    }
  }

  public getIsPlaying(): boolean {
    return this.ctx?.state === "running" && this.isEngineRunning;
  }

  public getActiveTrackUrl(): string | null {
    return this.activeTrackUrl;
  }
}

export const audioEngine = new AcousticsAudioEngine();
