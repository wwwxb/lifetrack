/* Five skins. A skin is a hue and a saturation; the whole palette derives from it. */

const STORE = "vitalhours.skin";

export const SKINS = [
  { id: "aurora", name: "经典", en: "Classic", h: 224, s: 44 },
  { id: "mint", name: "薄荷", en: "Mint", h: 158, s: 52 },
  { id: "ocean", name: "海洋", en: "Ocean", h: 198, s: 58 },
  { id: "rose", name: "玫瑰", en: "Rose", h: 340, s: 54 },
  { id: "amber", name: "琥珀", en: "Amber", h: 36, s: 56 },
];

const clamp = (n) => Math.max(0, Math.min(100, n));

export function paint(skin) {
  const root = document.documentElement;
  const { h, s } = skin;
  root.style.setProperty("--tint", `${h} 92% 82%`);
  root.style.setProperty("--tint-2", `${(h + 40) % 360} 90% 76%`);
  root.style.setProperty("--tint-3", `${(h + 16) % 360} 92% 88%`);
  root.style.setProperty("--orb-a", `hsl(${h} 88% 58% / .52)`);
  root.style.setProperty("--orb-b", `hsl(${(h + 46) % 360} 82% 62% / .46)`);
  root.style.setProperty("--orb-c", `hsl(${(h - 34 + 360) % 360} 86% 56% / .34)`);
  root.style.setProperty("--orb-d", `hsl(${(h + 96) % 360} 78% 62% / .22)`);
  root.style.setProperty("--orb-e", `hsl(${(h + 150) % 360} 70% 55% / .16)`);
  root.style.setProperty("--accent-1", `hsl(${clamp(h - 30 + 30)} 92% 74%)`);
  root.style.setProperty("--accent-2", `hsl(${h} 92% 80%)`);
  root.style.setProperty("--accent-3", `hsl(${(h + 60) % 360} 92% 82%)`);
  root.style.setProperty("--glow-top", `hsl(${h} ${s}% 16%)`);
  root.dataset.skin = skin.id;
}

export function current() {
  const id = localStorage.getItem(STORE);
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function save(id) {
  localStorage.setItem(STORE, id);
}

export function swatch(skin) {
  const sat = Math.max(40, Math.min(92, skin.s + 40));
  return `radial-gradient(circle at 30% 26%, hsl(${skin.h} ${sat}% 62%) 0%, transparent 62%),
          radial-gradient(circle at 74% 70%, hsl(${(skin.h + 50) % 360} ${sat - 8}% 64%) 0%, transparent 66%),
          #080b16`;
}
