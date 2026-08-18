import math
import random
import struct
import wave
import os

SAMPLE_RATE = 44100

def write_wav(filename, left_channel, right_channel):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    num_samples = len(left_channel)
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(2) # Stereo
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(SAMPLE_RATE)
        
        frames = bytearray()
        for i in range(num_samples):
            # Clamp and normalize
            l = max(-1.0, min(1.0, left_channel[i]))
            r = max(-1.0, min(1.0, right_channel[i]))
            
            # Apply seamless loop envelope at start & end (0.2s crossfade)
            crossfade_len = int(SAMPLE_RATE * 0.2)
            if i < crossfade_len:
                fade = i / crossfade_len
                l *= fade
                r *= fade
            elif i > num_samples - crossfade_len:
                fade = (num_samples - i) / crossfade_len
                l *= fade
                r *= fade
                
            l_int = int(l * 32767)
            r_int = int(r * 32767)
            frames.extend(struct.pack('<hh', l_int, r_int))
        wav_file.writeframes(frames)
    print(f"Generated: {filename} ({num_samples / SAMPLE_RATE:.1f}s)")

def generate_soft_brown_noise(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    last_l = 0.0
    last_r = 0.0
    
    for i in range(num_samples):
        white_l = random.uniform(-1, 1)
        white_r = random.uniform(-1, 1)
        
        last_l = (last_l + 0.02 * white_l) / 1.02
        last_r = (last_r + 0.02 * white_r) / 1.02
        
        # Soft warmth limiter
        left[i] = math.tanh(last_l * 3.0) * 0.5
        right[i] = math.tanh(last_r * 3.0) * 0.5
        
    return left, right

def generate_gentle_rain(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    b0_l, b1_l, b2_l = 0, 0, 0
    b0_r, b1_r, b2_r = 0, 0, 0
    
    for i in range(num_samples):
        # Pink noise bed
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        
        b0_l = 0.99 * b0_l + w_l * 0.05
        b1_l = 0.95 * b1_l + w_l * 0.1
        b2_l = 0.85 * b2_l + w_l * 0.2
        
        b0_r = 0.99 * b0_r + w_r * 0.05
        b1_r = 0.95 * b1_r + w_r * 0.1
        b2_r = 0.85 * b2_r + w_r * 0.2
        
        rain_bed_l = (b0_l + b1_l + b2_l) * 0.15
        rain_bed_r = (b0_r + b1_r + b2_r) * 0.15
        
        # Random raindrops
        if random.random() < 0.003:
            drop_amp = random.uniform(0.1, 0.3)
            rain_bed_l += drop_amp * math.sin(i * 0.15)
        if random.random() < 0.003:
            drop_amp = random.uniform(0.1, 0.3)
            rain_bed_r += drop_amp * math.sin(i * 0.18)
            
        left[i] = math.tanh(rain_bed_l) * 0.6
        right[i] = math.tanh(rain_bed_r) * 0.6
        
    return left, right

def generate_ocean_waves(duration=20):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    last_l, last_r = 0.0, 0.0
    
    for i in range(num_samples):
        # 0.1 Hz swell cycle (10-second waves)
        t = i / SAMPLE_RATE
        swell = (math.sin(2 * math.pi * 0.1 * t) + 1.0) * 0.5
        swell2 = (math.sin(2 * math.pi * 0.07 * t + 1.5) + 1.0) * 0.5
        combined_swell = (swell * 0.7 + swell2 * 0.3)
        
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        
        last_l = (last_l + 0.015 * w_l) / 1.015
        last_r = (last_r + 0.015 * w_r) / 1.015
        
        # Surf hiss on crest
        hiss_l = w_l * 0.03 * (combined_swell ** 2)
        hiss_r = w_r * 0.03 * (combined_swell ** 2)
        
        left[i] = (last_l * 2.5 * combined_swell + hiss_l) * 0.6
        right[i] = (last_r * 2.5 * combined_swell + hiss_r) * 0.6
        
    return left, right

def generate_forest_wind(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    b0, b1 = 0, 0
    
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        wind_gust = (math.sin(2 * math.pi * 0.15 * t) * math.sin(2 * math.pi * 0.05 * t) + 1.0) * 0.5
        
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        
        b0 = 0.98 * b0 + w_l * 0.08
        b1 = 0.98 * b1 + w_r * 0.08
        
        left[i] = b0 * (0.3 + 0.7 * wind_gust) * 0.5
        right[i] = b1 * (0.3 + 0.7 * wind_gust) * 0.5
        
    return left, right

def generate_campfire(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    last_l, last_r = 0.0, 0.0
    
    for i in range(num_samples):
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        
        # Low warm flame rumble
        last_l = (last_l + 0.01 * w_l) / 1.01
        last_r = (last_r + 0.01 * w_r) / 1.01
        
        crack_l = 0.0
        crack_r = 0.0
        
        # Wood crackles
        if random.random() < 0.0006:
            pop = random.uniform(0.3, 0.8)
            crack_l = pop
        if random.random() < 0.0006:
            pop = random.uniform(0.3, 0.8)
            crack_r = pop
            
        left[i] = (last_l * 2.0 + crack_l) * 0.5
        right[i] = (last_r * 2.0 + crack_r) * 0.5
        
    return left, right

def generate_alpha_pad(duration=15):
    """Warm analog synth pad in F# with 10Hz Binaural difference"""
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    # F#2 (92.5Hz), C#3 (138.59Hz), F#3 (185Hz), A#3 (233.08Hz)
    chord_freqs = [92.5, 138.59, 185.0, 233.08]
    
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        val_l = 0.0
        val_r = 0.0
        
        for idx, f in enumerate(chord_freqs):
            # 10Hz Binaural spread across ears
            f_l = f
            f_r = f + (10.0 if idx == 0 else 0.0)
            
            amp = 0.25 / (idx + 1)
            val_l += math.sin(2 * math.pi * f_l * t) * amp
            val_r += math.sin(2 * math.pi * f_r * t) * amp
            
        # Warm analog tape saturation
        left[i] = math.tanh(val_l * 1.5) * 0.5
        right[i] = math.tanh(val_r * 1.5) * 0.5
        
    return left, right

def generate_gamma_pad(duration=15):
    """Deep meditation chord with 40Hz Binaural focus overtone"""
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    # D2 (73.4Hz), A2 (110Hz), D3 (146.8Hz) + 40Hz Binaural Carrier (200Hz L, 240Hz R)
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        
        # Fundamental pad
        pad = math.sin(2 * math.pi * 73.4 * t) * 0.2 + math.sin(2 * math.pi * 110.0 * t) * 0.15
        
        # 40Hz Binaural Carrier
        gamma_l = math.sin(2 * math.pi * 200.0 * t) * 0.15
        gamma_r = math.sin(2 * math.pi * 240.0 * t) * 0.15
        
        left[i] = (pad + gamma_l) * 0.6
        right[i] = (pad + gamma_r) * 0.6
        
    return left, right

def generate_keyboard_clicks(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    for i in range(num_samples):
        if random.random() < 0.0008:
            click_amp = random.uniform(0.2, 0.5)
            click_freq = random.uniform(2500, 3800)
            decay = random.randint(150, 400)
            for d in range(decay):
                if i + d < num_samples:
                    env = (1.0 - d / decay) ** 2
                    val = math.sin(2 * math.pi * click_freq * (d / SAMPLE_RATE)) * click_amp * env
                    left[i + d] += val * 0.7
                    right[i + d] += val * 0.7
                    
        left[i] = max(-1.0, min(1.0, left[i]))
        right[i] = max(-1.0, min(1.0, right[i]))
        
    return left, right

def generate_tape_hiss(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    b0_l, b0_r = 0, 0
    for i in range(num_samples):
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        # High-shelf filtered hiss
        b0_l = 0.6 * b0_l + w_l * 0.4
        b0_r = 0.6 * b0_r + w_r * 0.4
        left[i] = b0_l * 0.15
        right[i] = b0_r * 0.15
    return left, right

def generate_cafe_murmur(duration=15):
    num_samples = int(SAMPLE_RATE * duration)
    left = [0.0] * num_samples
    right = [0.0] * num_samples
    
    b0_l, b1_l = 0, 0
    b0_r, b1_r = 0, 0
    
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        w_l = random.uniform(-1, 1)
        w_r = random.uniform(-1, 1)
        
        # Muffled bandpass vocal room tone
        b0_l = 0.95 * b0_l + w_l * 0.05
        b1_l = 0.85 * b1_l + w_l * 0.1
        
        b0_r = 0.95 * b0_r + w_r * 0.05
        b1_r = 0.85 * b1_r + w_r * 0.1
        
        # Subtle cup clinks
        clink_l, clink_r = 0.0, 0.0
        if random.random() < 0.0001:
            clink_l = math.sin(i * 0.4) * 0.15
        if random.random() < 0.0001:
            clink_r = math.sin(i * 0.45) * 0.15
            
        left[i] = ((b0_l + b1_l) * 0.6 + clink_l) * 0.4
        right[i] = ((b0_r + b1_r) * 0.6 + clink_r) * 0.4
        
    return left, right

def main():
    print("Synthesizing studio-grade organic acoustics assets...")
    
    # Soundscapes
    l, r = generate_gentle_rain(15)
    write_wav("public/audio/soundscapes/gentle-rain.wav", l, r)
    
    l, r = generate_ocean_waves(20)
    write_wav("public/audio/soundscapes/ocean-waves.wav", l, r)
    
    l, r = generate_forest_wind(15)
    write_wav("public/audio/soundscapes/forest-wind.wav", l, r)
    
    l, r = generate_campfire(15)
    write_wav("public/audio/soundscapes/night-campfire.wav", l, r)
    
    l, r = generate_soft_brown_noise(15)
    write_wav("public/audio/soundscapes/deep-brown-noise.wav", l, r)
    
    l, r = generate_alpha_pad(15)
    write_wav("public/audio/soundscapes/alpha-flow.wav", l, r)
    
    l, r = generate_gamma_pad(15)
    write_wav("public/audio/soundscapes/gamma-focus.wav", l, r)
    
    l, r = generate_cafe_murmur(15)
    write_wav("public/audio/soundscapes/coffee-shop.wav", l, r)
    
    # Ambient multi-track layers
    l, r = generate_gentle_rain(15)
    write_wav("public/audio/ambient/rain.wav", l, r)
    
    l, r = generate_keyboard_clicks(15)
    write_wav("public/audio/ambient/keyboard.wav", l, r)
    
    l, r = generate_tape_hiss(15)
    write_wav("public/audio/ambient/tape.wav", l, r)
    
    l, r = generate_cafe_murmur(15)
    write_wav("public/audio/ambient/cafe.wav", l, r)
    
    print("All audio assets generated successfully!")

if __name__ == "__main__":
    main()
