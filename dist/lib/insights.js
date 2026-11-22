/* Rule-based findings. Each rule returns a sentence or null; the list is ordered by interest. */

const fmt = (n, d = 0) => (n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));

export function insights(ctx, lang) {
  const zh = lang !== "en";
  const out = [];
  const push = (weight, zhText, enText) => out.push({ weight, zh: zhText, en: enText });

  const hours = ctx.listenSec / 3600;

  if (hours >= 1) {
    push(90,
      `这段日子里你戴着耳机听了 **${fmt(hours)} 小时**，相当于连续播放 **${fmt(hours / 24, 1)} 天**。`,
      `You listened for **${fmt(hours)} hours** — **${fmt(hours / 24, 1)} days** straight.`);
  }

  if (ctx.gapHours >= 1 && ctx.yearExtremes) {
    const { hi, hiV, lo, loV } = ctx.yearExtremes;
    if (hiV > 0 && loV > 0 && hiV / loV > 2) {
      push(78,
        `步数最高的一年是 **${hi}（${fmt(hiV)} 步）**，最低是 ${lo}（${fmt(loV)} 步），相差 ${fmt(hiV / loV, 1)} 倍。`,
        `Your busiest year was **${hi} (${fmt(hiV)} steps)**; the quietest was ${lo} (${fmt(loV)}), ${fmt(hiV / loV, 1)}× apart.`);
    }
  }

  if (ctx.avgDb) {
    const margin = 80 - ctx.avgDb;
    push(72,
      `平均音量 **${fmt(ctx.avgDb, 1)} dB**，距离 80 dB 的警戒线还有 ${fmt(margin, 1)} dB 余量。`,
      `Average level **${fmt(ctx.avgDb, 1)} dB** — ${fmt(margin, 1)} dB below the 80 dB line.`);
  }

  if (ctx.loudSec >= 60) {
    push(66,
      `音量超过 80 dB 的累计时长约 **${fmt(ctx.loudSec / 60)} 分钟**，是这份数据里最需要留意的一段。`,
      `About **${fmt(ctx.loudSec / 60)} minutes** above 80 dB — the part worth watching.`);
  }

  if (ctx.maxListenDay) {
    push(60,
      `听得最多的一天是 **${ctx.maxListenDay.day}**，一共 ${fmt(ctx.maxListenDay.v / 3600, 1)} 小时。`,
      `The heaviest day was **${ctx.maxListenDay.day}** — ${fmt(ctx.maxListenDay.v / 3600, 1)} hours.`);
  }

  if (ctx.workouts >= 3) {
    push(58,
      `一共 ${ctx.workouts} 次运动，跑步 ${fmt(ctx.runKm, 1)} 公里，第一次是 ${ctx.firstWorkout}。`,
      `${ctx.workouts} workouts, ${fmt(ctx.runKm, 1)} km run in total, starting ${ctx.firstWorkout}.`);
  }

  if (ctx.distKm >= 100) {
    const earth = ctx.distKm / 40075;
    push(54,
      `累计走了 **${fmt(ctx.distKm)} 公里**，相当于绕地球 ${fmt(earth * 100, 1)}% 的一圈。`,
      `**${fmt(ctx.distKm)} km** walked — ${fmt(earth * 100, 1)}% of the way around the planet.`);
  }

  if (ctx.stead) {
    push(48,
      `步行稳定性 **${fmt(ctx.stead * 100, 1)}%**，左右步态不对称 ${fmt(ctx.asym * 100, 1)}%，步态整体干净。`,
      `Walking steadiness **${fmt(ctx.stead * 100, 1)}%**, asymmetry ${fmt(ctx.asym * 100, 1)}% — a clean gait.`);
  }

  if (ctx.devices > 1) {
    push(46,
      `一共用过 **${ctx.devices} 副耳机**，服役时间最长的那副陪了你 ${fmt(ctx.topDeviceHours)} 小时。`,
      `**${ctx.devices} pairs** in total; the longest-serving one ran ${fmt(ctx.topDeviceHours)} hours.`);
  }

  if (ctx.ringsDays) {
    push(42,
      `活动圆环在 ${ctx.ringsDays} 天里有 ${ctx.ringsClosed} 天达标，达标率 ${fmt((ctx.ringsClosed / ctx.ringsDays) * 100)}%。`,
      `Rings closed on ${ctx.ringsClosed} of ${ctx.ringsDays} days — ${fmt((ctx.ringsClosed / ctx.ringsDays) * 100)}%.`);
  }

  if (ctx.missingSleep) {
    push(38,
      `这份导出里没有睡眠、血氧和静息心率——它们通常要配一块 Apple Watch 才会记录。`,
      `No sleep, blood oxygen or resting heart rate here — those need an Apple Watch.`);
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 8).map((x) => (zh ? x.zh : x.en));
}
