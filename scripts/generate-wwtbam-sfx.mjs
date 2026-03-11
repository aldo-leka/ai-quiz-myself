import fs from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44_100;
const OUTPUT_DIR = path.join(process.cwd(), "public", "audio", "wwtbam-original");

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function createBuffer(durationSeconds) {
  return new Float32Array(Math.floor(durationSeconds * SAMPLE_RATE));
}

function applyEnvelope(samples, attack, decay, sustainLevel, release) {
  const length = samples.length;
  const attackSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const decaySamples = Math.max(1, Math.floor(decay * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(release * SAMPLE_RATE));
  const sustainSamples = Math.max(0, length - attackSamples - decaySamples - releaseSamples);

  for (let i = 0; i < length; i += 1) {
    let gain;
    if (i < attackSamples) {
      gain = i / attackSamples;
    } else if (i < attackSamples + decaySamples) {
      const t = (i - attackSamples) / decaySamples;
      gain = 1 - (1 - sustainLevel) * t;
    } else if (i < attackSamples + decaySamples + sustainSamples) {
      gain = sustainLevel;
    } else {
      const t =
        (i - attackSamples - decaySamples - sustainSamples) / Math.max(1, releaseSamples);
      gain = sustainLevel * (1 - t);
    }
    samples[i] *= clampSample(gain);
  }
}

function addTone(samples, {
  startTime = 0,
  duration = samples.length / SAMPLE_RATE,
  gain = 0.5,
  type = "sine",
  freqStart,
  freqEnd = freqStart,
  phaseOffset = 0,
}) {
  const startSample = Math.floor(startTime * SAMPLE_RATE);
  const endSample = Math.min(samples.length, startSample + Math.floor(duration * SAMPLE_RATE));
  let phase = phaseOffset;

  for (let i = startSample; i < endSample; i += 1) {
    const progress = (i - startSample) / Math.max(1, endSample - startSample);
    const freq = freqStart + (freqEnd - freqStart) * progress;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;

    let value = Math.sin(phase);
    if (type === "triangle") {
      value = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else if (type === "square") {
      value = Math.sign(Math.sin(phase));
    }

    samples[i] += value * gain;
  }
}

function addNoise(samples, { startTime = 0, duration = samples.length / SAMPLE_RATE, gain = 0.1, seed = 1 }) {
  const rng = mulberry32(seed);
  const startSample = Math.floor(startTime * SAMPLE_RATE);
  const endSample = Math.min(samples.length, startSample + Math.floor(duration * SAMPLE_RATE));

  for (let i = startSample; i < endSample; i += 1) {
    samples[i] += (rng() * 2 - 1) * gain;
  }
}

function addEcho(samples, { delaySeconds = 0.18, feedback = 0.35, repeats = 3 }) {
  const delaySamples = Math.floor(delaySeconds * SAMPLE_RATE);
  const copy = new Float32Array(samples);

  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const gain = feedback ** repeat;
    for (let i = delaySamples * repeat; i < samples.length; i += 1) {
      samples[i] += copy[i - delaySamples * repeat] * gain;
    }
  }
}

function normalize(samples, peak = 0.92) {
  let max = 0;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  if (max === 0) return;

  const factor = peak / max;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = clampSample(samples[i] * factor);
  }
}

function writeMonoWav(filePath, samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.round(clampSample(samples[i]) * 32767);
    buffer.writeInt16LE(value, 44 + i * bytesPerSample);
  }

  fs.writeFileSync(filePath, buffer);
}

function createSelectSound() {
  const samples = createBuffer(0.28);
  addTone(samples, { freqStart: 880, freqEnd: 1040, gain: 0.34, type: "triangle" });
  addTone(samples, { freqStart: 1320, freqEnd: 1560, gain: 0.18 });
  addNoise(samples, { gain: 0.01, seed: 7 });
  applyEnvelope(samples, 0.008, 0.05, 0.35, 0.16);
  addEcho(samples, { delaySeconds: 0.07, feedback: 0.25, repeats: 2 });
  normalize(samples);
  return samples;
}

function createFinalLockSound() {
  const samples = createBuffer(0.95);
  addTone(samples, { freqStart: 110, freqEnd: 82, gain: 0.28, type: "triangle", duration: 0.22 });
  addTone(samples, { freqStart: 330, freqEnd: 590, gain: 0.18, startTime: 0.06, duration: 0.54 });
  addTone(samples, { freqStart: 495, freqEnd: 742, gain: 0.12, startTime: 0.12, duration: 0.46 });
  addNoise(samples, { startTime: 0.03, duration: 0.25, gain: 0.015, seed: 11 });
  applyEnvelope(samples, 0.01, 0.18, 0.4, 0.42);
  addEcho(samples, { delaySeconds: 0.14, feedback: 0.28, repeats: 3 });
  normalize(samples);
  return samples;
}

function createHostBedSound() {
  const samples = createBuffer(8);
  addTone(samples, { freqStart: 73.42, gain: 0.1, type: "triangle" });
  addTone(samples, { freqStart: 110, gain: 0.06 });
  addTone(samples, { freqStart: 146.83, gain: 0.045 });
  addTone(samples, { freqStart: 220, gain: 0.025, startTime: 0.4, duration: 7.2 });
  addNoise(samples, { gain: 0.008, seed: 19 });

  for (let i = 0; i < samples.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const pulse = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.35 * t);
    samples[i] *= pulse;
  }

  applyEnvelope(samples, 0.4, 0.8, 0.85, 0.7);
  addEcho(samples, { delaySeconds: 0.22, feedback: 0.2, repeats: 2 });
  normalize(samples, 0.8);
  return samples;
}

function createCorrectSound() {
  const samples = createBuffer(1.5);
  addTone(samples, { freqStart: 523.25, gain: 0.18, duration: 0.3 });
  addTone(samples, { freqStart: 659.25, gain: 0.18, startTime: 0.18, duration: 0.34 });
  addTone(samples, { freqStart: 783.99, gain: 0.2, startTime: 0.36, duration: 0.42 });
  addTone(samples, { freqStart: 1046.5, gain: 0.16, startTime: 0.54, duration: 0.55 });
  addTone(samples, { freqStart: 1318.51, gain: 0.08, startTime: 0.62, duration: 0.45 });
  applyEnvelope(samples, 0.01, 0.24, 0.7, 0.48);
  addEcho(samples, { delaySeconds: 0.12, feedback: 0.33, repeats: 3 });
  normalize(samples);
  return samples;
}

function createWrongSound() {
  const samples = createBuffer(1.3);
  addTone(samples, { freqStart: 220, freqEnd: 175, gain: 0.22, type: "triangle", duration: 0.4 });
  addTone(samples, { freqStart: 196, freqEnd: 146.83, gain: 0.16, startTime: 0.12, duration: 0.48 });
  addTone(samples, { freqStart: 130.81, freqEnd: 98, gain: 0.12, startTime: 0.25, duration: 0.6 });
  addNoise(samples, { startTime: 0.02, duration: 0.18, gain: 0.012, seed: 31 });
  applyEnvelope(samples, 0.008, 0.18, 0.6, 0.6);
  addEcho(samples, { delaySeconds: 0.16, feedback: 0.22, repeats: 2 });
  normalize(samples);
  return samples;
}

function createRevealSound() {
  const samples = createBuffer(0.75);
  addNoise(samples, { duration: 0.22, gain: 0.08, seed: 41 });
  addTone(samples, { freqStart: 260, freqEnd: 620, gain: 0.16, startTime: 0.05, duration: 0.38 });
  addTone(samples, { freqStart: 390, freqEnd: 780, gain: 0.08, startTime: 0.09, duration: 0.28 });
  applyEnvelope(samples, 0.002, 0.1, 0.45, 0.3);
  addEcho(samples, { delaySeconds: 0.09, feedback: 0.25, repeats: 2 });
  normalize(samples);
  return samples;
}

function createCheckpointSound() {
  const samples = createBuffer(1.8);
  addTone(samples, { freqStart: 392, gain: 0.16, duration: 0.3 });
  addTone(samples, { freqStart: 523.25, gain: 0.16, startTime: 0.16, duration: 0.34 });
  addTone(samples, { freqStart: 659.25, gain: 0.18, startTime: 0.32, duration: 0.42 });
  addTone(samples, { freqStart: 783.99, gain: 0.14, startTime: 0.48, duration: 0.55 });
  addTone(samples, { freqStart: 1046.5, gain: 0.1, startTime: 0.64, duration: 0.7 });
  addNoise(samples, { startTime: 0.4, duration: 0.3, gain: 0.01, seed: 53 });
  applyEnvelope(samples, 0.01, 0.22, 0.75, 0.7);
  addEcho(samples, { delaySeconds: 0.14, feedback: 0.34, repeats: 4 });
  normalize(samples);
  return samples;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function main() {
  ensureOutputDir();

  const assets = [
    ["select.wav", createSelectSound()],
    ["final-answer-lock.wav", createFinalLockSound()],
    ["host-bed.wav", createHostBedSound()],
    ["correct-answer.wav", createCorrectSound()],
    ["wrong-answer.wav", createWrongSound()],
    ["reveal-hit.wav", createRevealSound()],
    ["checkpoint.wav", createCheckpointSound()],
  ];

  for (const [fileName, samples] of assets) {
    writeMonoWav(path.join(OUTPUT_DIR, fileName), samples);
  }

  console.log(`Generated ${assets.length} original WWTBAM-style SFX assets in ${OUTPUT_DIR}`);
}

main();
