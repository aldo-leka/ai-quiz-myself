#!/usr/bin/env python3
"""
Generate wwtbam-jimmy SFX pack — original quiz show suspense sounds.

Creative approach: FM synthesis, filtered noise, Schroeder reverb,
darker/cinematic palette. Distinctly different from wwtbam-original
which uses pure additive synthesis + simple echo.
"""

import numpy as np
import soundfile as sf
import os

SAMPLE_RATE = 48000
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'public', 'audio', 'wwtbam-jimmy'
)


# ─── DSP Primitives ───────────────────────────────────────────────

def fm_osc(duration, carrier_freq, mod_freq, mod_index, sample_rate=SAMPLE_RATE,
           carrier_end=None, mod_index_end=None, phase=0.0):
    """FM synthesis oscillator. Returns float64 samples in [-1, 1]."""
    t = np.arange(int(duration * sample_rate)) / sample_rate
    if carrier_end is not None:
        fc = np.linspace(carrier_freq, carrier_end, len(t))
    else:
        fc = carrier_freq
    if mod_index_end is not None:
        beta = np.linspace(mod_index, mod_index_end, len(t))
    else:
        beta = mod_index
    modulator = beta * np.sin(2 * np.pi * mod_freq * t)
    # Accumulate phase for carrier (handles sweeps correctly)
    if isinstance(fc, np.ndarray):
        phase_acc = np.cumsum(fc) / sample_rate * 2 * np.pi + phase
    else:
        phase_acc = 2 * np.pi * fc * t + phase
    return np.sin(phase_acc + modulator)


def sine(duration, freq, freq_end=None, sample_rate=SAMPLE_RATE):
    """Simple sine oscillator with optional frequency sweep."""
    t = np.arange(int(duration * sample_rate)) / sample_rate
    if freq_end is not None:
        f = np.linspace(freq, freq_end, len(t))
        phase = np.cumsum(f) / sample_rate * 2 * np.pi
    else:
        phase = 2 * np.pi * freq * t
    return np.sin(phase)


def triangle(duration, freq, sample_rate=SAMPLE_RATE):
    """Triangle wave oscillator."""
    t = np.arange(int(duration * sample_rate)) / sample_rate
    return 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1


def noise(duration, sample_rate=SAMPLE_RATE, seed=42):
    """White noise generator."""
    rng = np.random.default_rng(seed)
    return rng.uniform(-1, 1, int(duration * sample_rate))


def lowpass(samples, cutoff, sample_rate=SAMPLE_RATE, order=2):
    """Simple IIR lowpass filter (cascaded one-pole)."""
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / sample_rate
    alpha = dt / (rc + dt)
    out = samples.copy()
    for _ in range(order):
        prev = 0.0
        for i in range(len(out)):
            prev = prev + alpha * (out[i] - prev)
            out[i] = prev
    return out


def highpass(samples, cutoff, sample_rate=SAMPLE_RATE):
    """Simple one-pole highpass filter."""
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / sample_rate
    alpha = rc / (rc + dt)
    out = np.zeros_like(samples)
    out[0] = samples[0]
    for i in range(1, len(samples)):
        out[i] = alpha * (out[i-1] + samples[i] - samples[i-1])
    return out


def bandpass(samples, low, high, sample_rate=SAMPLE_RATE):
    """Bandpass = lowpass then highpass."""
    s = lowpass(samples, high, sample_rate)
    return highpass(s, low, sample_rate)


def adsr(length, attack, decay, sustain_level, release, sample_rate=SAMPLE_RATE):
    """Generate ADSR envelope."""
    env = np.zeros(length)
    a = int(attack * sample_rate)
    d = int(decay * sample_rate)
    r = int(release * sample_rate)
    s = max(0, length - a - d - r)

    idx = 0
    # Attack
    seg = min(a, length - idx)
    env[idx:idx+seg] = np.linspace(0, 1, seg)
    idx += seg
    # Decay
    seg = min(d, length - idx)
    if seg > 0:
        env[idx:idx+seg] = np.linspace(1, sustain_level, seg)
    idx += seg
    # Sustain
    seg = min(s, length - idx)
    if seg > 0:
        env[idx:idx+seg] = sustain_level
    idx += seg
    # Release
    seg = min(r, length - idx)
    if seg > 0:
        start_val = env[idx-1] if idx > 0 else sustain_level
        env[idx:idx+seg] = np.linspace(start_val, 0, seg)
    return env


def exp_decay(length, decay_time, sample_rate=SAMPLE_RATE):
    """Exponential decay envelope."""
    t = np.arange(length) / sample_rate
    return np.exp(-t / decay_time)


def fade_in_out(samples, fade_in=0.01, fade_out=0.01, sample_rate=SAMPLE_RATE):
    """Apply quick fade in/out to prevent clicks."""
    fi = int(fade_in * sample_rate)
    fo = int(fade_out * sample_rate)
    out = samples.copy()
    if fi > 0 and fi < len(out):
        out[:fi] *= np.linspace(0, 1, fi)
    if fo > 0 and fo < len(out):
        out[-fo:] *= np.linspace(1, 0, fo)
    return out


def schroeder_reverb(samples, room_size=0.6, damping=0.4, wet=0.3, sample_rate=SAMPLE_RATE):
    """
    Simplified Schroeder reverb: 4 parallel comb filters + 2 series allpass.
    room_size scales delay times. damping controls HF absorption.
    """
    # Comb filter delay times (in samples), scaled by room_size
    comb_delays = [int(d * room_size) for d in [1557, 1617, 1491, 1422]]
    comb_gains = [0.84 - damping * 0.15] * 4

    # Allpass filter delays
    ap_delays = [int(d * room_size) for d in [225, 556]]
    ap_gain = 0.5

    length = len(samples)
    comb_out = np.zeros(length)

    # Parallel comb filters
    for delay, gain in zip(comb_delays, comb_gains):
        buf = np.zeros(length)
        for i in range(length):
            if i >= delay:
                buf[i] = samples[i] + gain * buf[i - delay]
            else:
                buf[i] = samples[i]
        comb_out += buf
    comb_out /= len(comb_delays)

    # Series allpass filters
    out = comb_out
    for delay in ap_delays:
        buf = np.zeros(length)
        for i in range(length):
            if i >= delay:
                buf[i] = -ap_gain * out[i] + out[i - delay] + ap_gain * buf[i - delay]
            else:
                buf[i] = out[i] * (1 - ap_gain)
        out = buf

    # Wet/dry mix
    return samples * (1 - wet) + out * wet


def multi_delay(samples, taps, sample_rate=SAMPLE_RATE):
    """Multi-tap delay. taps = [(delay_sec, gain), ...]"""
    out = samples.copy()
    for delay_sec, gain in taps:
        d = int(delay_sec * sample_rate)
        if d < len(out):
            delayed = np.zeros_like(out)
            delayed[d:] = out[:-d] if d > 0 else out
            out = out + delayed * gain
    return out


def mix(*layers):
    """Mix multiple (samples, gain) tuples, zero-padding to longest."""
    max_len = max(len(s) for s, _ in layers)
    out = np.zeros(max_len)
    for samples, gain in layers:
        out[:len(samples)] += samples * gain
    return out


def mix_at(*layers):
    """Mix (samples, gain, start_sec) tuples."""
    max_len = 0
    for samples, gain, start in layers:
        end = int(start * SAMPLE_RATE) + len(samples)
        max_len = max(max_len, end)
    out = np.zeros(max_len)
    for samples, gain, start in layers:
        idx = int(start * SAMPLE_RATE)
        out[idx:idx+len(samples)] += samples * gain
    return out


def normalize(samples, peak=0.92):
    """Normalize to peak level."""
    mx = np.max(np.abs(samples))
    if mx > 0:
        return samples * (peak / mx)
    return samples


def write_wav(filepath, samples):
    """Write 48kHz 24-bit mono WAV."""
    samples = normalize(samples)
    samples = fade_in_out(samples, 0.002, 0.005)
    sf.write(filepath, samples, SAMPLE_RATE, subtype='PCM_24')
    size_kb = os.path.getsize(filepath) / 1024
    dur = len(samples) / SAMPLE_RATE
    print(f"  {os.path.basename(filepath)}: {dur:.2f}s, {size_kb:.0f} KB")


# ─── Sound Generators ─────────────────────────────────────────────

def create_select():
    """
    Quick FM bell hit — crystalline, elegant.
    Two stacked FM tones with fast decay. Glass-tap quality.
    ~250ms
    """
    dur = 0.28

    # Primary FM bell (carrier 1568 Hz, mod ratio 1:2.01 for slight inharmonicity)
    bell1 = fm_osc(dur, 1568, 3152.68, 2.5, mod_index_end=0.3)
    env1 = exp_decay(len(bell1), 0.06)
    bell1 *= env1

    # Secondary shimmer (higher, quieter)
    bell2 = fm_osc(dur, 2349, 4704.7, 1.8, mod_index_end=0.1)
    env2 = exp_decay(len(bell2), 0.04)
    bell2 *= env2

    # Subtle sub-click
    click = sine(0.008, 4000) * np.linspace(1, 0, int(0.008 * SAMPLE_RATE))
    click_padded = np.zeros(int(dur * SAMPLE_RATE))
    click_padded[:len(click)] = click

    out = mix(
        (bell1, 0.55),
        (bell2, 0.25),
        (click_padded, 0.15)
    )
    out = multi_delay(out, [(0.045, 0.2), (0.085, 0.1)])
    return out


def create_final_answer_lock():
    """
    Dramatic decisive sting. Sub-bass impact + FM brass chord rising to lock point.
    ~1.0s
    """
    dur = 1.05

    # Sub-bass impact
    sub = sine(0.4, 55, freq_end=40)
    sub_env = exp_decay(len(sub), 0.15)
    sub *= sub_env

    # FM brass: carrier sweeps up, mod index decreases (brighter attack, smoother sustain)
    brass = fm_osc(dur, 220, 440, 4.0, carrier_end=330, mod_index_end=1.0)
    brass_env = adsr(len(brass), 0.005, 0.15, 0.5, 0.5)
    brass *= brass_env

    # Upper partial (fifth above, for power)
    upper = fm_osc(dur, 330, 660, 2.5, carrier_end=495, mod_index_end=0.5)
    upper_env = adsr(len(upper), 0.01, 0.2, 0.35, 0.45)
    upper *= upper_env

    # "Lock" noise burst
    lock_noise = noise(0.08, seed=77)
    lock_noise = bandpass(lock_noise, 800, 6000)
    lock_env = exp_decay(len(lock_noise), 0.02)
    lock_noise *= lock_env

    out = mix_at(
        (sub, 0.4, 0.0),
        (brass, 0.35, 0.02),
        (upper, 0.2, 0.04),
        (lock_noise, 0.15, 0.0)
    )
    out = schroeder_reverb(out, room_size=0.5, damping=0.5, wet=0.2)
    return out


def create_host_bed():
    """
    Dark ambient suspense bed. D minor drone with slow pulsing.
    ~12s, loop-friendly.
    """
    dur = 12.0
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE

    # Root drone D2 (73.42 Hz) — FM with very slow modulation
    drone_root = fm_osc(dur, 73.42, 73.42 * 1.5, 0.8)

    # Fifth above A2 (110 Hz) — subtle
    drone_fifth = sine(dur, 110)

    # Minor third F3 (174.61 Hz) — very quiet, creates the minor mood
    drone_minor = fm_osc(dur, 174.61, 174.61 * 2.01, 0.5)

    # Dark sub-rumble
    sub = sine(dur, 36.71)

    # Filtered noise bed
    noise_bed = noise(dur, seed=101)
    noise_bed = lowpass(noise_bed, 400)
    noise_bed = highpass(noise_bed, 60)

    # Slow LFO for pulse (heartbeat-like, ~0.8 Hz)
    lfo = 0.7 + 0.3 * np.sin(2 * np.pi * 0.8 * t)

    # Secondary slower LFO for drift (~0.12 Hz)
    lfo2 = 0.85 + 0.15 * np.sin(2 * np.pi * 0.12 * t)

    # Mix layers
    out = (
        drone_root * 0.22 +
        drone_fifth * 0.10 +
        drone_minor * 0.06 +
        sub * 0.08 +
        noise_bed * 0.04
    )
    out *= lfo * lfo2

    # Fade in/out for loop-friendliness (long crossfade tails)
    fade = int(1.5 * SAMPLE_RATE)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)

    out = schroeder_reverb(out, room_size=0.9, damping=0.3, wet=0.25)
    return out


def create_correct_answer():
    """
    Prestige success sting. Ascending major arpeggio with FM bells.
    G4-B4-D5-G5. Confident and rewarding.
    ~2.0s
    """
    dur = 2.0

    # G4 (392 Hz)
    note1 = fm_osc(0.35, 392, 784, 2.0, mod_index_end=0.5)
    env1 = adsr(len(note1), 0.005, 0.08, 0.6, 0.12)
    note1 *= env1

    # B4 (493.88 Hz)
    note2 = fm_osc(0.35, 493.88, 987.76, 2.0, mod_index_end=0.5)
    env2 = adsr(len(note2), 0.005, 0.08, 0.6, 0.12)
    note2 *= env2

    # D5 (587.33 Hz)
    note3 = fm_osc(0.45, 587.33, 1174.66, 2.2, mod_index_end=0.4)
    env3 = adsr(len(note3), 0.005, 0.1, 0.65, 0.18)
    note3 *= env3

    # G5 (783.99 Hz) — the crown note, longer
    note4 = fm_osc(0.8, 783.99, 1567.98, 2.5, mod_index_end=0.3)
    env4 = adsr(len(note4), 0.005, 0.15, 0.55, 0.45)
    note4 *= env4

    # Shimmer layer on top
    shimmer = fm_osc(1.0, 1567.98, 3135.96, 1.5, mod_index_end=0.1)
    shimmer_env = adsr(len(shimmer), 0.05, 0.2, 0.3, 0.5)
    shimmer *= shimmer_env

    out = mix_at(
        (note1, 0.3, 0.0),
        (note2, 0.3, 0.12),
        (note3, 0.32, 0.26),
        (note4, 0.35, 0.42),
        (shimmer, 0.1, 0.5)
    )
    out = schroeder_reverb(out, room_size=0.6, damping=0.35, wet=0.25)
    return out


def create_wrong_answer():
    """
    Serious failure sting. Descending minor 2nds + tritone. Heavy FM bass.
    Dark, dramatic, dignified.
    ~1.8s
    """
    dur = 1.8

    # Low FM tone descending (E3 → Eb3 → D3)
    tone1 = fm_osc(0.8, 164.81, 329.62, 3.5, carrier_end=155.56, mod_index_end=2.0)
    env1 = adsr(len(tone1), 0.005, 0.15, 0.6, 0.45)
    tone1 *= env1

    tone2 = fm_osc(0.7, 155.56, 311.12, 3.0, carrier_end=146.83, mod_index_end=1.5)
    env2 = adsr(len(tone2), 0.005, 0.12, 0.5, 0.4)
    tone2 *= env2

    # Tritone tension (Bb2, 116.54 Hz — tritone from E)
    tritone = fm_osc(1.2, 116.54, 233.08, 4.0, mod_index_end=1.0)
    tri_env = adsr(len(tritone), 0.01, 0.2, 0.4, 0.6)
    tritone *= tri_env

    # Sub-bass thud
    sub = sine(0.5, 55, freq_end=35)
    sub *= exp_decay(len(sub), 0.15)

    # Rumble noise
    rumble = noise(0.6, seed=63)
    rumble = lowpass(rumble, 200)
    rumble *= exp_decay(len(rumble), 0.2)

    # Dark tail — low sine fading out
    tail = sine(0.8, 73.42, freq_end=55)
    tail *= exp_decay(len(tail), 0.25)

    out = mix_at(
        (tone1, 0.3, 0.0),
        (tone2, 0.28, 0.35),
        (tritone, 0.2, 0.05),
        (sub, 0.25, 0.0),
        (rumble, 0.08, 0.0),
        (tail, 0.12, 0.6)
    )
    out = schroeder_reverb(out, room_size=0.8, damping=0.4, wet=0.25)
    return out


def create_reveal_hit():
    """
    Sharp reveal accent — metallic transient with pitch drop.
    "Spotlight snapping on." ~400ms
    """
    dur = 0.45

    # Sharp metallic FM hit (inharmonic ratio for metallic quality)
    metal = fm_osc(dur, 1200, 1200 * 1.414, 5.0, mod_index_end=0.5,
                   carrier_end=600)
    metal_env = exp_decay(len(metal), 0.04)
    metal *= metal_env

    # Bright noise burst
    burst = noise(0.03, seed=55)
    burst = bandpass(burst, 2000, 12000)
    burst_env = exp_decay(len(burst), 0.008)
    burst *= burst_env

    # Body tone
    body = fm_osc(dur, 440, 880, 2.0, carrier_end=330, mod_index_end=0.3)
    body_env = exp_decay(len(body), 0.08)
    body *= body_env

    # Sub-punch
    punch = sine(0.06, 120, freq_end=60)
    punch *= exp_decay(len(punch), 0.02)

    out = mix_at(
        (metal, 0.3, 0.0),
        (burst, 0.2, 0.0),
        (body, 0.3, 0.005),
        (punch, 0.15, 0.0)
    )
    out = multi_delay(out, [(0.05, 0.15), (0.1, 0.08)])
    return out


def create_checkpoint():
    """
    Grand milestone cue. Bigger than correct-answer. Layered FM chord with
    broad reverb. D major: D4-F#4-A4-D5-F#5.
    ~2.5s
    """
    dur = 2.8

    # D4 (293.66 Hz)
    n1 = fm_osc(0.8, 293.66, 587.32, 2.5, mod_index_end=0.8)
    n1 *= adsr(len(n1), 0.005, 0.12, 0.6, 0.35)

    # F#4 (369.99 Hz)
    n2 = fm_osc(0.75, 369.99, 739.98, 2.3, mod_index_end=0.7)
    n2 *= adsr(len(n2), 0.005, 0.1, 0.55, 0.35)

    # A4 (440 Hz)
    n3 = fm_osc(0.8, 440, 880, 2.5, mod_index_end=0.6)
    n3 *= adsr(len(n3), 0.005, 0.12, 0.6, 0.35)

    # D5 (587.33 Hz) — octave, prominent
    n4 = fm_osc(1.0, 587.33, 1174.66, 2.8, mod_index_end=0.5)
    n4 *= adsr(len(n4), 0.005, 0.15, 0.6, 0.5)

    # F#5 (739.99 Hz) — shimmer top
    n5 = fm_osc(0.9, 739.99, 1479.98, 2.0, mod_index_end=0.3)
    n5 *= adsr(len(n5), 0.01, 0.15, 0.4, 0.5)

    # Sub impact
    sub = sine(0.5, 73.42, freq_end=55)
    sub *= exp_decay(len(sub), 0.15)

    # Filtered noise shimmer
    shim = noise(1.5, seed=88)
    shim = bandpass(shim, 3000, 10000)
    shim *= adsr(len(shim), 0.1, 0.3, 0.2, 0.8)

    # Rising sweep
    sweep = fm_osc(0.6, 200, 400, 1.5, carrier_end=800, mod_index_end=0.2)
    sweep *= adsr(len(sweep), 0.02, 0.1, 0.3, 0.3)

    out = mix_at(
        (sub, 0.2, 0.0),
        (sweep, 0.1, 0.0),
        (n1, 0.22, 0.05),
        (n2, 0.2, 0.12),
        (n3, 0.22, 0.2),
        (n4, 0.25, 0.3),
        (n5, 0.15, 0.4),
        (shim, 0.06, 0.3)
    )
    out = schroeder_reverb(out, room_size=0.8, damping=0.3, wet=0.3)
    return out


# ─── Main ─────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating wwtbam-jimmy SFX pack → {OUTPUT_DIR}\n")

    assets = [
        ("select.wav", create_select),
        ("final-answer-lock.wav", create_final_answer_lock),
        ("host-bed.wav", create_host_bed),
        ("correct-answer.wav", create_correct_answer),
        ("wrong-answer.wav", create_wrong_answer),
        ("reveal-hit.wav", create_reveal_hit),
        ("checkpoint.wav", create_checkpoint),
    ]

    for name, gen_fn in assets:
        print(f"Generating {name}...")
        samples = gen_fn()
        write_wav(os.path.join(OUTPUT_DIR, name), samples)

    print(f"\nDone! {len(assets)} files generated.")


if __name__ == "__main__":
    main()
