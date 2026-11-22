/*
 * Synthesise a demo dataset in the same shape as data/prepared.json.
 * Nothing here comes from a real person — it exists so the public build has
 * something to show without shipping anyone's health records.
 *
 *   node tools/make-demo.mjs [out.json]
 */
import { writeFile } from "node:fs/promises";

const OUT = process.argv[2] || "data/demo.json";
const DAY = 86400000;

/* deterministic PRNG so the demo is stable between builds */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240117);
const between = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const START = Date.UTC(2023, 0, 1);
const COUNT = 1096; // 2023-01-01 .. 2025-12-31
const dayMs = (i) => START + i * DAY;
const iso = (i) => new Date(dayMs(i)).toISOString().slice(0, 10);

const zeros = () => new Array(COUNT).fill(null);

/* ---------------- daily series ---------------- */

const steps = zeros();
const dist = zeros();
const active = zeros();
const basal = zeros();
const flights = zeros();
const speed = zeros();
const steplen = zeros();
const ds = zeros();
const asym = zeros();
const stead = zeros();
const hr = zeros();
const hrN = zeros();
const hrMin = zeros();
const hrMax = zeros();
const listen = new Array(COUNT).fill(0);
const rec = zeros();

for (let i = 0; i < COUNT; i++) {
  const d = new Date(dayMs(i));
  const wd = d.getUTCDay();
  const month = d.getUTCMonth();
  const seasonal = 1 + 0.18 * Math.sin(((month + 1) / 12) * Math.PI * 2);
  const weekend = wd === 0 || wd === 6 ? 1.12 : 1;
  const lazy = rnd() < 0.07 ? 0.15 : 1; // a few very quiet days
  const s = Math.round(between(5200, 12800) * seasonal * weekend * lazy);
  steps[i] = s;
  dist[i] = Math.round(s * 0.00072 * 100) / 100;
  active[i] = Math.round(s * 0.036 + between(8, 40));
  basal[i] = Math.round(between(1380, 1560));
  flights[i] = Math.round(between(0, 14));

  if (i > 210) {
    speed[i] = Math.round(between(3.6, 4.6) * 100) / 100;
    steplen[i] = Math.round(between(58, 70) * 10) / 10;
    ds[i] = Math.round(between(0.27, 0.34) * 1000) / 1000;
    asym[i] = Math.round(between(0.008, 0.035) * 1000) / 1000;
    stead[i] = Math.round(between(0.88, 0.99) * 1000) / 1000;
  }
  if (i > 60 && i % 150 === 7) {
    hr[i] = Math.round(between(96, 138));
    hrN[i] = Math.round(between(60, 220));
    hrMin[i] = Math.round(between(62, 78));
    hrMax[i] = Math.round(between(142, 178));
  }
}

/* ---------------- headphones ---------------- */

const DEVICES = [
  { name: "AirPods Pro", model: "0x200e", mac: "AA:BB:CC:00:00:01", from: 0, to: 690 },
  { name: "Sony WH-1000XM5", model: "", mac: "AA:BB:CC:00:00:02", from: 640, to: 980 },
  { name: "有线耳机", model: "", mac: "AA:BB:CC:00:00:03", from: 950, to: COUNT - 1 },
];

const sessions = [];
const devices = DEVICES.map((dev, id) => ({
  id, name: dev.name, model: dev.model, mac: dev.mac, samples: 0,
  seconds: 0, sessions: 0, longest: 0, dbAvg: 0, dbMax: 0, loudSec: 0, loud: 0, first: 0, last: 0,
}));

const hoursHist = new Array(24).fill(0);
const week = Array.from({ length: 7 }, () => new Array(24).fill(0));
const buckets = {};

for (let di = 0; di < DEVICES.length; di++) {
  const dev = DEVICES[di];
  const devOut = devices[di];
  let dbWeighted = 0;
  for (let i = dev.from; i <= dev.to; i++) {
    if (rnd() > 0.58) continue;
    const n = rnd() < 0.28 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const hour = Math.round(between(7, 22));
      const start = Date.UTC(
        +iso(i).slice(0, 4), +iso(i).slice(5, 7) - 1, +iso(i).slice(8, 10), hour, Math.round(between(0, 55)), 0
      );
      const dur = Math.round(between(10, 82)) * 60000;
      const db = Math.round(between(37, 60) * 10) / 10;
      sessions.push([start, start + dur, db, dev.id]);
      listen[i] += dur / 1000;
      devOut.seconds += dur / 1000;
      devOut.sessions += 1;
      devOut.longest = Math.max(devOut.longest, dur / 1000);
      devOut.dbMax = Math.max(devOut.dbMax, db);
      dbWeighted += db * (dur / 1000);
      devOut.samples += Math.max(1, Math.round(dur / 250000));
      devOut.first = devOut.first ? Math.min(devOut.first, start) : start;
      devOut.last = Math.max(devOut.last, start + dur);
      if (db >= 80) { devOut.loud += 1; devOut.loudSec += dur / 1000; }

      const bucket = Math.floor(db / 5) * 5;
      buckets[bucket] = (buckets[bucket] || 0) + dur / 1000;

      let cur = start;
      while (cur < start + dur) {
        const dt = new Date(cur);
        const stop = Math.min(start + dur, cur - (cur % 3600000) + 3600000);
        hoursHist[dt.getUTCHours()] += (stop - cur) / 1000;
        week[dt.getUTCDay()][dt.getUTCHours()] += (stop - cur) / 1000;
        cur = stop;
      }
    }
  }
  devOut.dbAvg = devOut.seconds ? Math.round((dbWeighted / devOut.seconds) * 10) / 10 : 0;
}

sessions.sort((a, b) => a[0] - b[0]);
const totalListen = sessions.reduce((s, x) => s + (x[1] - x[0]) / 1000, 0);
const eqDb = devices.reduce((s, d) => s + d.dbAvg * d.seconds, 0) / (totalListen || 1);

/* ---------------- rings, workouts, routes ---------------- */

const rings = [];
for (let i = 0; i < COUNT; i++) rings.push([i, active[i] || 0, 320]);

const routes = [];
const workouts = [];
const runPlan = [
  [COUNT - 300, 5.2], [COUNT - 262, 6.8], [COUNT - 224, 4.4], [COUNT - 186, 8.1],
  [COUNT - 148, 5.6], [COUNT - 110, 7.3], [COUNT - 72, 4.9], [COUNT - 34, 10.2],
];

for (const [i, km] of runPlan) {
  const date = iso(i);
  const dur = Math.round(km * between(5.6, 6.6) * 10) / 10;
  const day = workoutsDayPush({
    date,
    type: "Running",
    dur,
    dist: Math.round(km * 100) / 100,
    kcal: Math.round(km * between(58, 72)),
    elev: Math.round(between(0, 60)),
    mets: Math.round(between(8, 12) * 10) / 10,
    speed: Math.round((km / (dur / 60)) * 100) / 100,
    steps: Math.round(km * between(1150, 1350)),
  });
  void day;

  // a plausible loop around a city block
  const lat0 = 31.2 + rnd() * 0.06;
  const lng0 = 121.4 + rnd() * 0.08;
  const pts = [];
  const n = 72;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(a * 3);
    pts.push([
      Math.round((lat0 + Math.sin(a) * 0.004 * wob * (km / 5)) * 1e5) / 1e5,
      Math.round((lng0 + Math.cos(a) * 0.005 * wob * (km / 5)) * 1e5) / 1e5,
    ]);
  }
  routes.push({ d: date, pts, km: Math.round(km * 100) / 100 });
}

function workoutsDayPush(w) { workouts.push(w); return w; }
workouts.sort((a, b) => (a.date < b.date ? -1 : 1));

/* ---------------- coverage table ---------------- */

const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const daysWith = (a) => a.filter((v) => v !== null).length;

function row(key, unit, n, days, first, last, total) {
  const type = "HKQuantityTypeIdentifier" + key;
  const avg = n ? total / n : null;
  return { type, key: type, unit, n, days, first, last, avg, min: null, max: null, total };
}

const audioSamples = devices.reduce((s, d) => s + d.samples, 0);
const rows = [
  row("StepCount", "count", Math.round(sum(steps) / 75), daysWith(steps), dayMs(0), dayMs(COUNT - 1), sum(steps)),
  row("DistanceWalkingRunning", "km", Math.round(sum(dist) / 0.14), daysWith(dist), dayMs(0), dayMs(COUNT - 1), sum(dist)),
  row("BasalEnergyBurned", "kcal", Math.round(sum(basal) / 32), daysWith(basal), dayMs(0), dayMs(COUNT - 1), sum(basal)),
  row("HeadphoneAudioExposure", "dBASPL", audioSamples, 620, dayMs(DEVICES[0].from), dayMs(COUNT - 1), 0),
  row("WalkingSpeed", "km/hr", Math.round(daysWith(speed) * 28), daysWith(speed), dayMs(211), dayMs(COUNT - 1), 0),
  row("WalkingStepLength", "cm", Math.round(daysWith(steplen) * 28), daysWith(steplen), dayMs(211), dayMs(COUNT - 1), 0),
  row("WalkingDoubleSupportPercentage", "%", Math.round(daysWith(ds) * 25), daysWith(ds), dayMs(211), dayMs(COUNT - 1), 0),
  row("ActiveEnergyBurned", "kcal", Math.round(sum(active) / 6.8), daysWith(active), dayMs(0), dayMs(COUNT - 1), sum(active)),
  row("WalkingAsymmetryPercentage", "%", Math.round(daysWith(asym) * 13), daysWith(asym), dayMs(211), dayMs(COUNT - 1), 0),
  row("FlightsClimbed", "count", Math.round(sum(flights) / 2.1), daysWith(flights), dayMs(0), dayMs(COUNT - 1), sum(flights)),
  row("HeartRate", "count/min", sum(hrN), daysWith(hr), dayMs(60), dayMs(COUNT - 1), 0),
  row("AppleWalkingSteadiness", "%", daysWith(stead), daysWith(stead), dayMs(211), dayMs(COUNT - 1), 0),
  row("RunningSpeed", "km/hr", workouts.length * 4, workouts.length, dayMs(runPlan[0][0]), dayMs(COUNT - 1), 0),
  row("Height", "cm", 1, 1, dayMs(300), dayMs(300), 174),
];

// averages for the instantaneous types (the table shows 单条平均 / 最大)
const avgOf = (a) => {
  const v = a.filter((x) => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const maxOf = (a) => Math.max(...a.filter((x) => x !== null));
const byKey = Object.fromEntries(rows.map((r) => [r.key.replace("HKQuantityTypeIdentifier", ""), r]));

byKey.WalkingSpeed.avg = Math.round(avgOf(speed) * 100) / 100;
byKey.WalkingSpeed.max = Math.round(maxOf(speed) * 100) / 100;
byKey.WalkingStepLength.avg = Math.round(avgOf(steplen) * 10) / 10;
byKey.WalkingStepLength.max = Math.round(maxOf(steplen) * 10) / 10;
byKey.WalkingDoubleSupportPercentage.avg = avgOf(ds);
byKey.WalkingDoubleSupportPercentage.max = maxOf(ds);
byKey.WalkingAsymmetryPercentage.avg = avgOf(asym);
byKey.WalkingAsymmetryPercentage.max = maxOf(asym);
byKey.AppleWalkingSteadiness.avg = avgOf(stead);
byKey.AppleWalkingSteadiness.max = maxOf(stead);
byKey.HeartRate.avg = Math.round(avgOf(hr));
byKey.HeartRate.max = maxOf(hrMax.filter((v) => v !== null));
byKey.StepCount.avg = 75;
byKey.StepCount.max = Math.round(maxOf(steps) / 60);
byKey.DistanceWalkingRunning.avg = 0.14;
byKey.DistanceWalkingRunning.max = 6.4;
byKey.BasalEnergyBurned.avg = 32;
byKey.BasalEnergyBurned.max = 70;
byKey.ActiveEnergyBurned.avg = 6.8;
byKey.ActiveEnergyBurned.max = 148;
byKey.FlightsClimbed.avg = 2.1;
byKey.FlightsClimbed.max = 14;
byKey.HeadphoneAudioExposure.avg = Math.round(eqDb * 10) / 10;
byKey.HeadphoneAudioExposure.max = Math.max(...sessions.map((s) => s[2]));
byKey.HeadphoneAudioExposure.total = 0;
byKey.RunningSpeed.avg = Math.round(avgOf(workouts.map((w) => w.speed)) * 100) / 100;
byKey.RunningSpeed.max = Math.max(...workouts.map((w) => w.speed));
byKey.Height.avg = 174;
byKey.Height.max = 174;

rows.sort((a, b) => b.n - a.n);

/* records per day, scaled so the range totals match the coverage table */
const weights = [];
for (let i = 0; i < COUNT; i++) {
  const perStep = (steps[i] || 0) / 75;
  const audio = listen[i] > 0 ? listen[i] / 5 : 0;
  weights.push(perStep + audio + 3);
}
const totalRecords = rows.reduce((s, r) => s + r.n, 0);
const wSum = weights.reduce((s, v) => s + v, 0);
for (let i = 0; i < COUNT; i++) rec[i] = Math.round((weights[i] / wSum) * totalRecords);

/* ---------------- assemble ---------------- */

const data = {
  meta: {
    exportDate: "2026-01-08 09:12:44 +0800",
    me: { dob: "1996-01-01", sex: "HKBiologicalSexNotSet", blood: "", skin: "" },
    start: iso(0),
    end: iso(COUNT - 1),
    days: COUNT,
    records: rows.reduce((s, r) => s + r.n, 0),
    types: rows.length,
    workouts: workouts.length,
    sources: [["演示 iPhone", rows.reduce((s, r) => s + r.n, 0)]],
    demo: true,
  },
  devices: devices.filter((d) => d.seconds > 0).map((d, i) => ({ ...d, id: d.id })),
  sessions,
  hours: hoursHist,
  week,
  audio: { buckets, seconds: Math.round(totalListen) },
  days: {
    start: iso(0), end: iso(COUNT - 1), count: COUNT,
    steps, dist, active, basal, flights, speed, steplen, ds, asym, stead,
    hr, hrN, hrMin, hrMax, listen, rec,
  },
  rings,
  workouts,
  coverage: rows,
  routes,
};

await writeFile(OUT, JSON.stringify(data));
console.log(
  `${OUT}  ${(JSON.stringify(data).length / 1048576).toFixed(2)} MB  ` +
  `${data.meta.records} records · ${sessions.length} sessions · ${(totalListen / 3600).toFixed(0)} h listen`
);
