// P1.4: the week's recap as a 1080×1920 picture for Instagram Stories: the colony's streak, the
// shared goal's percentage and Kip. Drawn on a canvas on the device; never an amount of money.
export async function recapImage(r: { colony: string; streak: number; goal: { name: string; pct: number } | null }): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const text = v('--text', '#0f2540');
  const progress = v('--progress', '#0b7a57');

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, v('--bg', '#eaf4ff'));
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const load = (src: string) =>
    new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = no;
      i.src = src;
    });
  const [kip, flame] = await Promise.all([load('/mascot/pose-celebrate.webp'), load('/mascot/flame.webp')]);

  g.textAlign = 'center';
  g.fillStyle = text;
  g.font = '800 64px Archivo, system-ui, sans-serif';
  g.fillText('Our week', W / 2, 200);
  g.font = '700 52px Archivo, system-ui, sans-serif';
  g.fillText(`The "${r.colony}" colony`, W / 2, 280);

  const kh = 720;
  const kw = (kip.width / kip.height) * kh;
  g.drawImage(kip, (W - kw) / 2, 360, kw, kh);

  g.drawImage(flame, W / 2 - 250, 1150, 150, 150);
  g.textAlign = 'left';
  g.font = '900 150px Archivo, system-ui, sans-serif';
  g.fillText(String(r.streak), W / 2 - 80, 1290);
  g.textAlign = 'center';
  g.font = '700 54px Archivo, system-ui, sans-serif';
  g.fillText(r.streak === 1 ? 'day in a row, together' : 'days in a row, together', W / 2, 1380);

  if (r.goal) {
    g.font = '700 52px Archivo, system-ui, sans-serif';
    g.fillText(`"${r.goal.name}"`, W / 2, 1520);
    const x = 140;
    const w = W - 280;
    g.fillStyle = '#dde9fb';
    g.beginPath();
    g.roundRect(x, 1560, w, 44, 22);
    g.fill();
    g.fillStyle = progress;
    g.beginPath();
    g.roundRect(x, 1560, Math.max(44, (w * Math.min(100, r.goal.pct)) / 100), 44, 22);
    g.fill();
    g.fillStyle = progress;
    g.font = '900 88px Archivo, system-ui, sans-serif';
    g.fillText(`${r.goal.pct}%`, W / 2, 1720);
  }
  g.fillStyle = text;
  g.font = '800 44px Archivo, system-ui, sans-serif';
  g.fillText('Kip', W / 2, 1850);

  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no image'))), 'image/png'));
}
