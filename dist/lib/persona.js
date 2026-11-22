/* Health persona: pick the archetype the numbers point at, plus four traits. */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

const ARCHETYPES = [
  {
    id: "noct",
    code: "NOCT",
    zh: "夜行者", en: "Night walker",
    roastZh: "白天的耳机是工具，深夜的耳机才是生活。",
    roastEn: "By day the headphones are a tool; after midnight they are the point.",
    score: (f) => f.nightShare * 165,
  },
  {
    id: "trvl",
    code: "TRVL",
    zh: "通勤乐手", en: "Commuter",
    roastZh: "早高峰和晚高峰，你的歌单比地铁还准时。",
    roastEn: "Your playlist is more punctual than the metro.",
    score: (f) => f.commuteShare * 190,
  },
  {
    id: "loop",
    code: "LOOP",
    zh: "单曲循环者", en: "Loop rider",
    roastZh: "一次戴上就是几个小时，耳朵比脑子更耐坐。",
    roastEn: "One session is hours long — your ears have better stamina than you do.",
    score: (f) => Math.min(100, f.avgSessionsPerDay * 26 + f.longestMin / 6),
  },
  {
    id: "walk",
    code: "WALK",
    zh: "步行者", en: "Walker",
    roastZh: "耳机是你的背景音，走路才是正文。",
    roastEn: "The headphones are the soundtrack; walking is the plot.",
    score: (f) => Math.min(100, (f.stepsAvg / 11000) * 95),
  },
  {
    id: "runr",
    code: "RUNR",
    zh: "耐力派", en: "Endurance",
    roastZh: "别人听歌，你把耳机当节拍器。",
    roastEn: "Others listen; you use them as a metronome.",
    score: (f) => Math.min(100, f.workouts * 7 + f.runKm * 0.6),
  },
  {
    id: "hush",
    code: "HUSH",
    zh: "静音派", en: "Quiet listener",
    roastZh: "音量永远留有余地，是对耳朵最温柔的那种人。",
    roastEn: "Always a little below the line — the gentlest thing you do to your ears.",
    score: (f) => Math.max(0, 78 - f.avgDb) * 2.4,
  },
  {
    id: "wand",
    code: "WAND",
    zh: "探索者", en: "Explorer",
    roastZh: "换来换去，每副耳机都有一段属于它的路。",
    roastEn: "You swap gear, and each pair owns a stretch of your timeline.",
    score: (f) => Math.min(100, f.devices * 17 + f.routes * 4),
  },
  {
    id: "even",
    code: "EVEN",
    zh: "均衡派", en: "Balanced",
    roastZh: "不极端，不偏科，数据看起来很舒服。",
    roastEn: "Nothing extreme, nothing missing. The data looks comfortable.",
    score: () => 52,
  },
];

export function persona(f, lang) {
  let best = ARCHETYPES[ARCHETYPES.length - 1];
  let bestScore = -1;
  for (const a of ARCHETYPES) {
    const s = a.score(f);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  const traits = [
    { zh: "夜间浓度", en: "Night share", v: clamp(f.nightShare * 100) },
    { zh: "音量", en: "Loudness", v: clamp(((f.avgDb - 35) / 45) * 100) },
    { zh: "活跃度", en: "Activity", v: clamp((f.stepsAvg / 12000) * 100) },
    { zh: "规律性", en: "Consistency", v: clamp((f.activeDays / Math.max(1, f.spanDays)) * 100) },
  ];
  return {
    code: best.code,
    name: lang === "en" ? best.en : best.zh,
    roast: lang === "en" ? best.roastEn : best.roastZh,
    traits,
    id: best.id,
  };
}
