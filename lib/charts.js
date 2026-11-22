/* Hand-drawn SVG charts. No dependencies; every chart is a pure string builder. */

const A1 = "#7dd3fc";
const A2 = "#a5b4fc";
const A3 = "#f0abfc";
const TINT = "230 94% 82%";

let uid = 0;
const nid = (p) => p + (++uid);

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Monotone-ish smoothing through the points; falls back to straight lines. */
function smooth(pts) {
  if (pts.length < 3) return pts.map((p, i) => (i ? "L" : "M") + round(p[0], 2) + " " + round(p[1], 2)).join(" ");
  let d = `M${round(pts[0][0], 2)} ${round(pts[0][1], 2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.22;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${round(c1x, 2)} ${round(c1y, 2)} ${round(c2x, 2)} ${round(c2y, 2)} ${round(p2[0], 2)} ${round(p2[1], 2)}`;
  }
  return d;
}

/**
 * Glowing area line — the signature chart.
 * @param {{w:number,h:number,values:(number|null)[],labels?:string[],peak?:boolean,gradient?:boolean}} o
 */
export function areaLine(o) {
  const w = Math.max(120, o.w);
  const h = o.h || 170;
  const labels = o.labels || null;
  const pad = { t: 16, r: 8, b: labels ? 26 : 16, l: 8 };
  const vals = o.values.filter((v) => v !== null && v !== undefined);
  const max = Math.max(1, ...vals);
  const min = o.floor === undefined ? 0 : o.floor;
  const span = max - min || 1;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = o.values.length;
  const x = (i) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v - min) / span) * innerH;
  const pts = o.values.map((v, i) => [x(i), y(v === null || v === undefined ? min : v)]).filter(Boolean);

  const id = nid("ln");
  const line = smooth(pts);
  const area = `${line} L${round(x(n - 1), 2)} ${round(pad.t + innerH, 2)} L${round(x(0), 2)} ${round(pad.t + innerH, 2)} Z`;

  let peakMark = "";
  if (o.peak !== false && vals.length) {
    let bi = 0;
    for (let i = 0; i < o.values.length; i++) {
      if ((o.values[i] || 0) > (o.values[bi] || 0)) bi = i;
    }
    const px = x(bi), py = y(o.values[bi] || 0);
    peakMark = `
      <line x1="${round(px, 2)}" y1="${round(py + 6, 2)}" x2="${round(px, 2)}" y2="${round(pad.t + innerH, 2)}"
            stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-dasharray="2 4"/>
      <circle cx="${round(px, 2)}" cy="${round(py, 2)}" r="9" fill="rgba(255,255,255,.14)"/>
      <circle cx="${round(px, 2)}" cy="${round(py, 2)}" r="3.6" fill="#fff"/>`;
  }

  let xLabels = "";
  if (labels) {
    const step = Math.max(1, Math.ceil(labels.length / Math.max(3, Math.floor(w / 46))));
    labels.forEach((lab, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      xLabels += `<text x="${round(x(i), 1)}" y="${h - 6}" text-anchor="middle" font-size="10.5" fill="rgba(255,255,255,.4)">${lab}</text>`;
    });
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${o.aria || ""}">
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${A1}"/><stop offset=".52" stop-color="${A2}"/><stop offset="1" stop-color="${A3}"/>
      </linearGradient>
      <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${A2}" stop-opacity=".34"/>
        <stop offset="1" stop-color="${A2}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id}f)"/>
    <path d="${line}" fill="none" stroke="url(#${id}s)" stroke-width="6" stroke-opacity=".16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${line}" fill="none" stroke="url(#${id}s)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${peakMark}
    ${xLabels}
  </svg>`;
}

/** Vertical bars with rounded tops, capped width and optional labels. */
export function bars(o) {
  const w = Math.max(120, o.w), h = o.h || 150;
  const labels = o.labels || null;
  const pad = { t: 14, r: 6, b: labels ? 24 : 10, l: 6 };
  const n = o.values.length || 1;
  const max = Math.max(1, ...o.values.map((v) => v || 0));
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const gap = Math.min(10, innerW / n * 0.3);
  const bw = Math.max(3, Math.min(46, (innerW - gap * (n - 1)) / n));
  const totalW = bw * n + gap * (n - 1);
  const x0 = pad.l + (innerW - totalW) / 2;
  const id = nid("br");
  let out = "";
  o.values.forEach((v, i) => {
    const vv = v || 0;
    const bh = vv <= 0 ? 0 : Math.max(3, (vv / max) * innerH);
    const x = x0 + i * (bw + gap);
    const y = pad.t + innerH - bh;
    out += `<rect x="${round(x, 2)}" y="${round(y, 2)}" width="${round(bw, 2)}" height="${round(bh, 2)}" rx="${round(Math.min(7, bw / 2), 2)}" fill="url(#${id})"/>`;
    if (labels && labels[i]) {
      out += `<text x="${round(x + bw / 2, 1)}" y="${h - 6}" text-anchor="middle" font-size="10.5" fill="${i === o.highlight ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.42)"}">${labels[i]}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${o.aria || ""}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${A3}" stop-opacity=".98"/>
      <stop offset=".6" stop-color="${A2}" stop-opacity=".8"/>
      <stop offset="1" stop-color="${A1}" stop-opacity=".55"/>
    </linearGradient></defs>
    ${out}
  </svg>`;
}

/**
 * Contribution-style calendar of the last `weeks` weeks ending at `end` (day index into values).
 */
export function calendar(o) {
  const w = Math.max(160, o.w);
  const gap = 3;
  const minCell = o.minCell || 9;
  const endIdx = o.endIdx;
  const maxWeeks = Math.max(4, Math.floor((w + gap) / (minCell + gap)));
  const weeks = Math.min(o.weeks || 53, maxWeeks, Math.floor(endIdx / 7) + 1);
  const startCol = endIdx - weeks * 7 + 1;
  const cw = (w - gap * (weeks - 1)) / weeks;
  const ch = Math.min(cw, 15);
  const labelH = o.monthOf ? 15 : 0;
  const max = Math.max(1, ...o.values.filter((v) => v));
  const steps = [0.06, 0.22, 0.42, 0.64, 0.9];
  let cells = "";
  let labels = "";
  let lastMonth = "";
  for (let wi = 0; wi < weeks; wi++) {
    const idx = startCol + wi * 7;
    if (o.monthOf && idx >= 0) {
      const m = o.monthOf(idx);
      if (m !== lastMonth) {
        labels += `<text x="${round(wi * (cw + gap), 1)}" y="9" fill="rgba(255,255,255,.42)" font-size="10.5">${m}</text>`;
        lastMonth = m;
      }
    }
    for (let d = 0; d < 7; d++) {
      const i = idx + d;
      if (i < 0 || i > endIdx) continue;
      const v = o.values[i] || 0;
      const lvl = v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999));
      const op = steps[lvl] ?? 0.06;
      cells += `<rect x="${round(wi * (cw + gap), 1)}" y="${round(labelH + d * (ch + gap), 1)}" width="${round(cw, 1)}" height="${round(ch, 1)}" rx="2.4" style="fill:hsl(var(--tint)/${op})"><title>${o.tip ? o.tip(i, v) : v}</title></rect>`;
    }
  }
  const H = labelH + 7 * (ch + gap) - gap;
  return {
    svg: `<svg viewBox="0 0 ${w} ${round(H, 1)}" width="${w}" height="${round(H, 1)}" role="img" aria-label="${o.aria || ""}">${labels}${cells}</svg>`,
    height: H,
  };
}

/** 24 radial bars with a needle on the peak hour. */
export function sunburst(o) {
  const size = o.size || 200;
  const c = size / 2;
  const hours = o.hours;
  const max = Math.max(1, ...hours);
  const r0 = size * 0.2;
  const rMax = size * 0.44;
  const peak = hours.indexOf(max);
  let bars = "";
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const ratio = hours[i] / max;
    const len = r0 + 4 + ratio * (rMax - r0);
    const isPeak = i === peak && max > 0;
    const x1 = c + Math.cos(ang) * r0, y1 = c + Math.sin(ang) * r0;
    const x2 = c + Math.cos(ang) * (isPeak ? rMax + size * 0.05 : len);
    const y2 = c + Math.sin(ang) * (isPeak ? rMax + size * 0.05 : len);
    bars += isPeak
      ? `<line x1="${round(x1, 1)}" y1="${round(y1, 1)}" x2="${round(x2, 1)}" y2="${round(y2, 1)}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".95"/>`
      : `<line x1="${round(x1, 1)}" y1="${round(y1, 1)}" x2="${round(x2, 1)}" y2="${round(y2, 1)}" stroke="${i % 3 === 0 ? A2 : A1}" stroke-width="3.4" stroke-linecap="round" opacity="${round(0.28 + ratio * 0.62, 2)}"/>`;
  }
  const lab = (t, x, y) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.4)" font-size="${round(size * 0.052, 1)}">${t}</text>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${o.aria || ""}">
    <circle cx="${c}" cy="${c}" r="${r0 - 2}" style="fill:hsl(var(--tint)/.07)" style="stroke:hsl(var(--tint)/.18)"/>
    ${bars}
    ${lab("0", c, c - r0 * 0.42)}
    ${lab("6", c + r0 * 0.46, c)}
    ${lab("12", c, c + r0 * 0.44)}
    ${lab("18", c - r0 * 0.46, c)}
  </svg>`;
}

/** Weekday bars (Sunday first) with the busiest day lifted. */
export function weekBars(o) {
  const w = Math.max(160, o.w);
  const vals = o.week;
  const max = Math.max(1, ...vals);
  const gap = 6;
  const bw = (w - gap * 6) / 7;
  let out = "";
  vals.forEach((v, i) => {
    const bh = 6 + (v / max) * 26;
    const x = i * (bw + gap);
    const y = 34 - bh;
    out += `<rect x="${round(x, 2)}" y="${round(y, 2)}" width="${round(bw, 2)}" height="${round(bh, 2)}" rx="9" style="fill:hsl(var(--tint)/${round(0.1 + (v / max) * 0.78, 2)})"/>`;
  });
  return out;
}

/** 7 × 24 heat grid (row = weekday, Sunday first). */
export function heatGrid(o) {
  const w = Math.max(160, o.w);
  const gap = 3;
  const cw = (w - gap * 23) / 24;
  const ch = Math.min(18, cw * 2.4);
  const max = Math.max(1, ...o.week.flat());
  let out = "";
  for (let d = 0; d < 7; d++) {
    for (let hh = 0; hh < 24; hh++) {
      const v = o.week[d][hh] || 0;
      const op = v === 0 ? 0.05 : round(0.12 + (v / max) * 0.78, 2);
      out += `<rect x="${round(hh * (cw + gap), 2)}" y="${round(d * (ch + gap), 2)}" width="${round(cw, 2)}" height="${round(ch, 2)}" rx="2.4" style="fill:hsl(var(--tint)/${op})"/>`;
    }
  }
  const H = 7 * (ch + gap) - gap;
  return { svg: `<svg viewBox="0 0 ${w} ${round(H, 1)}" width="${w}" height="${round(H, 1)}" role="img" aria-label="${o.aria || ""}">${out}</svg>`, height: H };
}

/** Radar with 5–8 axes. */
export function radar(o) {
  const size = o.size || 200;
  const c = size / 2;
  const R = size * 0.36;
  const axes = o.axes;
  const n = axes.length;
  const ang = (i) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (i, r) => [c + Math.cos(ang(i)) * r, c + Math.sin(ang(i)) * r];
  let rings = "";
  for (const f of [0.33, 0.66, 1]) {
    const p = axes.map((_, i) => pt(i, R * f).map((v) => round(v, 1)).join(",")).join(" ");
    rings += `<polygon points="${p}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1"/>`;
  }
  let spokes = "";
  axes.forEach((_, i) => {
    const [x, y] = pt(i, R);
    spokes += `<line x1="${c}" y1="${c}" x2="${round(x, 1)}" y2="${round(y, 1)}" stroke="rgba(255,255,255,.08)"/>`;
  });
  const poly = axes.map((a, i) => {
    const v = Math.max(0.06, Math.min(1, o.values[i] / (o.max || 1)));
    return pt(i, R * v).map((x) => round(x, 1)).join(",");
  }).join(" ");
  let dots = "";
  axes.forEach((a, i) => {
    const v = Math.max(0.06, Math.min(1, o.values[i] / (o.max || 1)));
    const [x, y] = pt(i, R * v);
    dots += `<circle cx="${round(x, 1)}" cy="${round(y, 1)}" r="2.6" fill="${A3}"/>`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${o.aria || ""}">
    ${rings}${spokes}
    <polygon points="${poly}" style="fill:hsl(var(--tint)/.22)" stroke="${A2}" stroke-width="1.8" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

/** Normalised route polyline. */
export function routeMap(o) {
  const size = o.size || 120;
  const pts = o.pts;
  if (!pts || pts.length < 2) return "";
  let minA = 90, maxA = -90, minB = 180, maxB = -180;
  for (const [a, b] of pts) {
    if (a < minA) minA = a; if (a > maxA) maxA = a;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }
  const spanA = maxA - minA || 1e-6, spanB = maxB - minB || 1e-6;
  const k = Math.min((size - 12) / spanB, (size - 12) / spanA);
  const cx = (size - spanB * k) / 2, cy = (size - spanA * k) / 2;
  const xy = pts.map(([a, b]) => [round(cx + (b - minB) * k, 2), round(cy + (maxA - a) * k, 2)]);
  const d = xy.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  const id = nid("rt");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="route">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${A1}"/><stop offset="1" stop-color="${A3}"/></linearGradient></defs>
    <path d="${d}" fill="none" stroke="url(#${id})" stroke-width="4.5" stroke-opacity=".22" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="url(#${id})" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${xy[0][0]}" cy="${xy[0][1]}" r="2.6" fill="#fff" opacity=".9"/>
  </svg>`;
}

/** Tiny sparkline for trend rows. */
export function spark(o) {
  const w = o.w || 90, h = o.h || 26;
  const vals = o.values.filter((v) => v !== null && v !== undefined);
  if (vals.length < 2) return "";
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const n = o.values.length;
  const pts = [];
  o.values.forEach((v, i) => {
    if (v === null || v === undefined) return;
    pts.push([(i / (n - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <path d="${smooth(pts)}" fill="none" stroke="${A2}" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>
  </svg>`;
}

/** Donut with gaps between slices and a total in the middle. */
export function donut(o) {
  const size = o.size || 200;
  const c = size / 2;
  const r = size * 0.36;
  const w = size * 0.105;
  const data = o.data || [];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const CIRC = 2 * Math.PI * r;
  const gap = data.length > 1 ? CIRC * 0.008 : 0;
  let acc = 0;
  let arcs = "";
  data.forEach((d, i) => {
    const frac = d.value / total;
    const len = Math.max(0, frac * CIRC - gap);
    const op = 0.95 - i * 0.07;
    arcs += `<circle cx="${c}" cy="${c}" r="${round(r, 2)}" fill="none" stroke-width="${round(w, 2)}"
      style="stroke:hsl(var(--tint)/${Math.max(0.18, op).toFixed(2)})"
      stroke-dasharray="${round(len, 2)} ${round(CIRC - len, 2)}"
      stroke-dashoffset="${round(-acc, 2)}"
      transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`;
    acc += frac * CIRC;
  });
  const big = o.centerValue || "";
  const sub = o.centerLabel || "";
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${o.aria || ""}">
    <circle cx="${c}" cy="${c}" r="${round(r, 2)}" fill="none" stroke-width="${round(w, 2)}" stroke="rgba(255,255,255,.06)"/>
    ${arcs}
    ${big ? `<text x="${c}" y="${c - size * 0.01}" text-anchor="middle" fill="#fff" font-size="${round(size * 0.15, 1)}" font-weight="700" letter-spacing="-1">${big}</text>` : ""}
    ${sub ? `<text x="${c}" y="${c + size * 0.12}" text-anchor="middle" fill="rgba(255,255,255,.5)" font-size="${round(size * 0.058, 1)}">${sub}</text>` : ""}
  </svg>`;
}
