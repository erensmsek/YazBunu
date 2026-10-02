// Seviye (RMS) tabanlı kayan çubuk görselleştirici. Hem renderer'daki worklet'ten hem de
// main süreçteki (Linux parec) seviyelerden beslenebilir.
export class Waveform {
  private levels: number[] = [];
  private raf = 0;
  private readonly bars = 44;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  push(level: number): void {
    // Konuşma RMS'i genelde 0.01–0.3: karekök ölçeği sessiz sesleri de görünür kılar.
    const v = Math.min(1, Math.sqrt(Math.max(0, level)) * 2.4);
    this.levels.push(v);
    if (this.levels.length > this.bars) this.levels.shift();
  }

  start(): void {
    this.levels = [];
    this.canvas.classList.add("is-active");
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      this.render();
    };
    draw();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.classList.remove("is-active");
    const ctx = this.canvas.getContext("2d");
    ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.levels = [];
  }

  private render(): void {
    const canvas = this.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--red").trim() || "#ef5a52";
    const gap = 3;
    const barW = (w - (this.bars - 1) * gap) / this.bars;
    if (barW <= 0) return;
    const mid = h / 2;
    const offset = this.bars - this.levels.length;
    for (let i = 0; i < this.bars; i++) {
      const v = i >= offset ? this.levels[i - offset] : 0;
      const bh = Math.max(3, v * h * 0.92);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35 + v * 0.65;
      const x = i * (barW + gap);
      const r = Math.min(barW / 2, 3);
      ctx.beginPath();
      ctx.roundRect(x, mid - bh / 2, barW, bh, r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
