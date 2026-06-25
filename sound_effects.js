/**
 * sound_effects.js
 * '코티지 우드 & 크림 베이지' 테마에 최적화하여 
 * 도자기 자석과 나무 보드가 조화롭게 만나 부딪히는 "똑/툭" 마찰음을 실시간 합성합니다.
 */

class SoundEffects {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * 자석 부착음 (맑고 아늑한 실로폰/물방울 퐁당 어쿠스틱 플럭 햅틱 사운드)
     */
    playSnap() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // 1. 메인 톤 (Sine wave - 맑고 동글동글한 울림)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(987.77, now); // B5 (맑은 하이 바이브)
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.14); // 가볍게 미끄러짐

        gain1.gain.setValueAtTime(0.12, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);

        // 2. 바디 톤 (Triangle wave - 부드러운 아랫소리 배음)
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(493.88, now); // B4 (옥타브 아래)
        
        gain2.gain.setValueAtTime(0.08, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        // 3. 초크 노이즈 (매우 짧은 물방울 타격음 어택 효과)
        const osc3 = this.ctx.createOscillator();
        const gain3 = this.ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1975.53, now); // B6 (2배음 고음역대 하이라이트)

        gain3.gain.setValueAtTime(0.04, now);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc3.connect(gain3);
        gain3.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);

        osc1.stop(now + 0.15);
        osc2.stop(now + 0.20);
        osc3.stop(now + 0.05);
    }

    /**
     * 자석 뗄 때 소리 (나무 핀에서 부드럽게 분리되는 똑 소리)
     */
    playDetach() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.02);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.03);
    }

    /**
     * 자석 서랍으로 날아갈 때의 부드러운 미끄러짐 소리 (Swoosh)
     */
    playSwoosh() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const duration = 0.22;

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // 밴드패스 필터를 이용해 마일드한 바람 소리 튜닝
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 2.5;
        filter.frequency.setValueAtTime(250, now);
        filter.frequency.exponentialRampToValueAtTime(1100, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.12, now + duration * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start(now);
        noiseNode.stop(now + duration);
    }

    /**
     * 냉장고 문 열릴 때 (나무 마찰음 합성)
     */
    playOpen() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const duration = 0.45;

        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.linearRampToValueAtTime(100, now + duration);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(150, now);
        filter.frequency.linearRampToValueAtTime(80, now + duration);

        gain.gain.setValueAtTime(0.03, now);
        gain.gain.linearRampToValueAtTime(0.01, now + duration * 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * 냉장고 문 닫힐 때 (쿵 하고 나무가 부딪히는 소리)
     */
    playClose() {
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(85, now);
        osc1.frequency.exponentialRampToValueAtTime(30, now + 0.1);

        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(180, now);
        osc2.frequency.exponentialRampToValueAtTime(90, now + 0.04);

        gain2.gain.setValueAtTime(0.1, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.12);
        osc2.stop(now + 0.12);
    }
}

window.fridgeSounds = new SoundEffects();
