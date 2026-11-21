/**
 * A copy certificate as a standalone SVG document. Colours are passed in (read
 * from the app's tokens by the caller) so the file looks right outside the app.
 */
export interface CertificateData {
  name: string;
  call?: string;
  wpm: number;
  accuracy: number;
  date: Date;
}

export interface CertificateColours {
  paper: string;
  ink: string;
  ink2: string;
  brass: string;
  brassHi: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The speed spelled in Morse along the border, as pills: e.g. 20 → ..--- ----- */
const SPELL: Record<string, string> = {
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

function morseBand(text: string, x0: number, y: number, unit: number, fill: string): string {
  let x = x0;
  let out = '';
  for (const ch of text) {
    for (const el of SPELL[ch] ?? '') {
      const w = (el === '-' ? 3 : 1) * unit;
      out += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${unit}" rx="${unit / 2}" fill="${fill}"/>`;
      x += w + unit;
    }
    x += 3 * unit;
  }
  return out;
}

export function certificateSvg(d: CertificateData, c: CertificateColours): string {
  const W = 1000;
  const H = 700;
  const date = d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const who = d.call ? `${esc(d.name)} · ${esc(d.call)}` : esc(d.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Morse Code copy certificate: ${d.wpm} words per minute">
  <rect width="${W}" height="${H}" fill="${c.paper}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${c.brass}" stroke-width="3"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${c.brassHi}" stroke-width="1"/>
  ${morseBand(String(d.wpm).repeat(6), 70, 60, 6, c.brassHi)}
  <text x="${W / 2}" y="190" text-anchor="middle" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="${c.ink2}">MORSE CODE</text>
  <text x="${W / 2}" y="260" text-anchor="middle" font-family="Georgia, serif" font-size="56" font-weight="600" fill="${c.ink}">Certificate of Copy</text>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${c.ink2}">This certifies that</text>
  <text x="${W / 2}" y="395" text-anchor="middle" font-family="Georgia, serif" font-size="44" font-style="italic" fill="${c.ink}">${who}</text>
  <text x="${W / 2}" y="455" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${c.ink2}">copied a minute of plain text by ear at</text>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="Georgia, serif" font-size="72" font-weight="600" fill="${c.brass}">${d.wpm} WPM</text>
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="${c.ink2}">with ${Math.round(d.accuracy * 100)}% accuracy · ${esc(date)}</text>
  ${morseBand(String(d.wpm).repeat(6), 70, H - 72, 6, c.brassHi)}
</svg>`;
}
