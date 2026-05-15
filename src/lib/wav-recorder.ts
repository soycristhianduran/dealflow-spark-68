/**
 * Minimal WAV recorder for Instagram outgoing voice notes.
 *
 * Why WAV (and not MP3 or Opus)?  Meta's Instagram Messaging API only
 * accepts a narrow set of audio attachment formats: aac, m4a, wav, mp4.
 * MP3 (audio/mpeg) and Ogg/Opus both get rejected with error 100.
 * Encoding AAC in the browser requires WASM (heavy) — but WAV is trivial:
 * just 16-bit PCM samples wrapped in a 44-byte header.
 *
 * Trade-off: WAV is ~10× larger than MP3 for the same duration.  Mitigated
 * by recording mono at 16 kHz instead of stereo at 44.1 kHz, so a 10-second
 * voice note ends up around 320 KB — well within Meta's 25 MB limit.
 */
export class WavRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 16000;

  /** Request the mic, build the audio graph, start capturing samples. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: this.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Use the system AudioContext sample rate, then downsample at the end —
    // browsers ignore sampleRate hints in getUserMedia constraints in many
    // versions, so we get whatever the hardware uses (typically 44.1 kHz or
    // 48 kHz).
    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // ScriptProcessor is deprecated but supported everywhere and lets us
    // collect PCM samples synchronously.  AudioWorklet would be the modern
    // choice but adds a separate module file for marginal benefit on this
    // small workload.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Copy — the buffer is reused by the audio engine
      this.chunks.push(new Float32Array(input));
    };

    this.source.connect(this.processor);
    // Required for the processor to actually fire `onaudioprocess` — even
    // though we don't want to hear ourselves.  Wire to a muted gain node to
    // avoid feedback.
    const muted = this.audioContext.createGain();
    muted.gain.value = 0;
    this.processor.connect(muted);
    muted.connect(this.audioContext.destination);
  }

  /** Stop capturing and return the encoded WAV blob. */
  async stop(): Promise<Blob> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());

    const inputSampleRate = this.audioContext?.sampleRate || 44100;
    const targetSampleRate = this.sampleRate;
    await this.audioContext?.close();

    // Concatenate all chunks into one big Float32Array
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];

    // Downsample if necessary (browser likely captured at 44.1 or 48 kHz;
    // we want 16 kHz to keep file size reasonable for voice).
    const downsampled = inputSampleRate === targetSampleRate
      ? merged
      : downsample(merged, inputSampleRate, targetSampleRate);

    return encodeWav(downsampled, targetSampleRate);
  }

  /** Discard captured audio and release resources without producing a blob. */
  cancel(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.chunks = [];
  }
}

/** Linear-interpolation downsample. */
function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (outputRate >= inputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIdx - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return output;
}

/** Wrap PCM samples in a 44-byte WAV (PCM, 16-bit, mono) header. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Float32 → Int16 PCM
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
