To create **gong and bell sounds programmatically**, use **additive synthesis** (combining sine waves with inharmonic partials) or **FM synthesis**. Here's how:

### Key Sound Characteristics

| Aspect | Bell | Gong |
|--------|------|------|
| **Partials** | Inharmonic (2.4, 3.0, 4.0, 5.0× fundamental)  [dnmtechs](https://dnmtechs.com/creating-a-sound-effect-bell-using-python-3-programming/) | Many inharmonic partials (1–12× fundamental)  [dafx](https://www.dafx.de/paper-archive/details/_HhxQRl-yal5hunEZ5gckQ) |
| **Fundamental** | Often missing; brain infers it  [folkworks](https://folkworks.org/the-sound-of-bells/) | Lower (~100–200 Hz), prominent "boom" |
| **Pitch Glide** | Minimal | 5% drop over duration (characteristic "boom")  [dafx](https://www.dafx.de/paper-archive/details/_HhxQRl-yal5hunEZ5gckQ) |
| **Decay** | Higher partials decay faster  [dnmtechs](https://dnmtechs.com/creating-a-sound-effect-bell-using-python-3-programming/) | Lower partials sustain longer; complex decay |
| **Metallic Quality** | Clear harmonics | Beating/detuning, noisy component |

***

### Python Code: Additive Synthesis Bell

```python
import numpy as np
import wave

def create_bell(filename='bell.wav', duration=3.0, sr=44100, freq=440):
    t = np.linspace(0, duration, int(duration * sr), False)
    
    # Inharmonic partials (typical bell spectrum) [web:13]
    partials = [(1.0, 0.5, 0.5), (2.4, 0.3, 1.5), (3.0, 0.2, 1.2),
                (4.0, 0.15, 1.0), (5.0, 0.1, 1.5), (6.0, 0.08, 2.0)]
    
    sound = np.zeros_like(t)
    for ratio, amp, decay in partials:
        envelope = np.exp(-decay * t)
        sound += amp * envelope * np.sin(2 * np.pi * freq * ratio * t)
    
    sound = np.clip(sound * 0.8 / np.max(np.abs(sound)), -1, 1)
    sound_int16 = (sound * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as w:
        w.setparams((1, 2, sr, len(sound_int16), 'NONE', 'uncompressed'))
        w.writeframes(sound_int16.tobytes())
    return filename
```

***

### Python Code: Gong with Pitch Glide

```python
def create_gong(filename='gong.wav', duration=5.0, sr=44100, freq=150):
    t = np.linspace(0, duration, int(duration * sr), False)
    
    # Many inharmonic partials [web:12]
    num_partials = 20
    ratios = np.linspace(1.0, 12.0, num_partials)
    amplitudes = 1.0 / np.arange(1, num_partials + 1)
    
    # Pitch glide (5% drop) [web:12]
    glide = 1.0 - 0.05 * (t / duration)
    
    sound = np.zeros_like(t)
    for i, ratio in enumerate(ratios):
        decay = 0.3 + 0.8 * (i / num_partials)
        envelope = np.exp(-decay * t)
        phase_mod = 0.1 * np.sin(2 * np.pi * 3 * t)  # beating effect
        sound += amplitudes[i] * envelope * np.sin(2 * np.pi * freq * ratio * glide * t + phase_mod)
    
    # Low-frequency boom
    sound += 0.4 * np.exp(-0.3 * t) * np.sin(2 * np.pi * freq * 0.5 * t)
    
    sound = np.clip(sound * 0.8 / np.max(np.abs(sound)), -1, 1)
    sound_int16 = (sound * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as w:
        w.setparams((1, 2, sr, len(sound_int16), 'NONE', 'uncompressed'))
        w.writeframes(sound_int16.tobytes())
    return filename
```

***

### FM Synthesis Alternative (Bell)

FM synthesis creates metallic tones by modulating one oscillator with another: [music.mcgill](https://www.music.mcgill.ca/~gary/307/week9/node17.html)

```python
def create_fm_bell(filename='fm_bell.wav', duration=2.0, sr=44100, carrier=440):
    t = np.arange(int(duration * sr)) / sr
    modulator = 220  # FM frequency
    k = 25.0  # deviation constant [web:22]
    
    waveform = np.cos(2 * np.pi * carrier * t + k * np.sin(2 * np.pi * modulator * t))
    envelope = np.exp(-1.5 * t)
    sound = waveform * envelope * 0.3
    
    sound_int16 = (np.clip(sound, -1, 1) * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as w:
        w.setparams((1, 2, sr, len(sound_int16), 'NONE', 'uncompressed'))
        w.writeframes(sound_int16.tobytes())
```

***

### Usage

```python
create_bell('bell.wav', freq=440)    # Church bell
create_gong('gong.wav', freq=150)    # Symphonic gong
create_fm_bell('fm_bell.wav')        # FM-synthesized bell
```

**Install dependencies**: `pip install numpy` (wave is built-in)

The key is **inharmonic partials** (not integer multiples) for metallic character, plus **exponential decay envelopes** where higher frequencies fade faster. [dnmtechs](https://dnmtechs.com/creating-a-sound-effect-bell-using-python-3-programming/)