// The ECHO holocall — BL2-style remote quest chatter. A flickering hologram
// bust of the caller slides in beside the tracker, their lines typewrite
// beneath it, and the character voice engine performs them. Calls queue, so
// a turn-in call and the follow-up briefing play back to back while the
// player keeps shooting.

import { voice, voiceOf } from '../audio/voice';
import { audio } from '../audio/synth';

export interface HolocallLook {
  name: string;
  accent: string;   // hologram tint
  hat: 'top' | 'hood' | 'cap' | 'goggles' | 'bun' | 'none';
}

export const CALL_LOOKS: Record<string, HolocallLook> = {
  quibb: { name: 'FOREMAN QUIBB', accent: '#ffd23c', hat: 'cap' },
  zaza: { name: 'MADAME ZAZA', accent: '#c06bff', hat: 'hood' },
  mayor: { name: 'MAYOR BRASS', accent: '#ffd23c', hat: 'top' },
  brann: { name: 'BRANN', accent: '#7dffef', hat: 'cap' },
  mirelle: { name: 'MIRELLE', accent: '#9ad8e8', hat: 'hood' },
  okto: { name: 'BROTHER OKTO', accent: '#ffb43c', hat: 'hood' },
  juno: { name: 'DR. CALLA', accent: '#9adc4a', hat: 'cap' },
  rita: { name: 'REDLINE RITA', accent: '#ff8c2a', hat: 'goggles' },
};

interface Call {
  giver: string;
  title: string | null;   // e.g. "NEW CONTRACT — The Signal"
  lines: string[];
}

class HolocallSystem {
  private queue: Call[] = [];
  private root: HTMLElement | null = null;
  private playing = false;
  private timer: number | null = null;

  call(giver: string, lines: string[], title: string | null = null): void {
    this.queue.push({ giver, lines: lines.filter(Boolean), title });
    if (!this.playing) this.playNext();
  }

  private ensureRoot(): HTMLElement {
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'holocall';
      this.root.style.cssText = `
        position:absolute; left:22px; top:170px; z-index:6; width:330px;
        display:none; pointer-events:none; font-family:inherit;`;
      const style = document.createElement('style');
      style.textContent = `
        @keyframes holoflicker { 0%,100%{opacity:1} 88%{opacity:1} 90%{opacity:0.55} 92%{opacity:0.9} 95%{opacity:0.7} 97%{opacity:1} }
        @keyframes holoin { from{transform:translateX(-40px); opacity:0} to{transform:translateX(0); opacity:1} }
        #holocall .hc-box { display:flex; gap:10px; background:rgba(10,18,26,0.82); border:1px solid rgba(84,212,255,0.55);
          border-left:3px solid var(--hc-accent,#54d4ff); padding:10px 12px; animation: holoin 0.25s ease-out; box-shadow:0 4px 18px rgba(0,0,0,0.45); }
        #holocall .hc-portrait { width:64px; height:74px; flex:none; position:relative; animation: holoflicker 2.3s infinite; }
        #holocall .hc-portrait canvas { width:100%; height:100%; image-rendering:pixelated; }
        #holocall .hc-live { position:absolute; top:2px; right:2px; width:7px; height:7px; border-radius:50%; background:#3ddc4e; box-shadow:0 0 6px #3ddc4e; }
        #holocall .hc-name { font-size:12px; font-weight:800; letter-spacing:1.5px; color:var(--hc-accent,#54d4ff); }
        #holocall .hc-title { font-size:11px; color:#ffd23c; margin-top:1px; font-weight:700; }
        #holocall .hc-text { font-size:12.5px; color:#eaf4f8; margin-top:4px; line-height:1.45; min-height:34px; text-shadow:0 1px 0 rgba(0,0,0,0.6); }
        #holocall .hc-sig { font-size:9px; color:rgba(84,212,255,0.65); letter-spacing:2px; margin-top:4px; }`;
      document.head.appendChild(style);
      document.getElementById('ui-root')?.appendChild(this.root);
    }
    return this.root;
  }

  /** A tiny hologram bust: head, shoulders, hat, scanlines — all canvas. */
  private drawPortrait(cv: HTMLCanvasElement, look: HolocallLook): void {
    const ctx = cv.getContext('2d')!;
    const W = (cv.width = 64), H = (cv.height = 74);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(84,212,255,0.10)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = look.accent;
    ctx.fillStyle = look.accent;
    ctx.globalAlpha = 0.9;
    // shoulders + head
    ctx.fillRect(10, 52, 44, 20);
    ctx.fillRect(22, 24, 20, 24);
    // face shadow notch (eyes)
    ctx.clearRect(26, 34, 4, 3);
    ctx.clearRect(34, 34, 4, 3);
    // hat
    if (look.hat === 'top') { ctx.fillRect(18, 12, 28, 4); ctx.fillRect(24, 2, 16, 12); }
    else if (look.hat === 'hood') { ctx.beginPath(); ctx.moveTo(18, 26); ctx.lineTo(32, 6); ctx.lineTo(46, 26); ctx.fill(); }
    else if (look.hat === 'cap') { ctx.fillRect(20, 18, 24, 6); ctx.fillRect(20, 20, 32, 3); }
    else if (look.hat === 'goggles') { ctx.fillRect(20, 20, 24, 5); ctx.clearRect(24, 21, 6, 3); ctx.clearRect(34, 21, 6, 3); }
    else if (look.hat === 'bun') { ctx.fillRect(26, 14, 12, 10); }
    // scanlines
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#04121a';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
  }

  private playNext(): void {
    const call = this.queue.shift();
    if (!call) { this.playing = false; this.hide(); return; }
    this.playing = true;
    const look = CALL_LOOKS[call.giver] ?? CALL_LOOKS.quibb;
    const root = this.ensureRoot();
    root.style.setProperty('--hc-accent', look.accent);
    root.innerHTML = `
      <div class="hc-box">
        <div class="hc-portrait"><canvas></canvas><div class="hc-live"></div></div>
        <div style="flex:1; min-width:0;">
          <div class="hc-name">◈ ${look.name}</div>
          ${call.title ? `<div class="hc-title">${call.title}</div>` : ''}
          <div class="hc-text" id="hc-text"></div>
          <div class="hc-sig">ECHO-NET · LIVE RELAY</div>
        </div>
      </div>`;
    root.style.display = 'block';
    this.drawPortrait(root.querySelector('canvas')!, look);
    audio.uiOpen();

    // play the lines: voice performs each one while it typewrites
    const textEl = root.querySelector('#hc-text') as HTMLElement;
    const lines = call.lines.length ? call.lines : ['…'];
    let li = 0;
    const nextLine = () => {
      if (li >= lines.length) {
        this.timer = window.setTimeout(() => this.playNext(), 1100);
        return;
      }
      const line = lines[li++];
      const spoken = voice.speak(line, voiceOf(call.giver));
      // typewriter paced to roughly match the voice (or a floor if muted)
      const dur = Math.max(spoken, Math.min(0.05 * line.length, 3.2));
      textEl.textContent = '';
      let ci = 0;
      const step = Math.max(10, (dur * 1000 * 0.82) / line.length);
      const type = () => {
        ci += 1;
        textEl.textContent = line.slice(0, ci);
        if (ci < line.length) this.timer = window.setTimeout(type, step);
        else this.timer = window.setTimeout(nextLine, Math.max(350, dur * 1000 - line.length * step));
      };
      type();
    };
    nextLine();
  }

  private hide(): void {
    if (this.root) this.root.style.display = 'none';
  }

  /** Hard stop (map switch mid-call is fine — the ECHO drops signal). */
  clear(): void {
    this.queue = [];
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.playing = false;
    voice.cancel();
    this.hide();
  }
}

export const holocall = new HolocallSystem();
