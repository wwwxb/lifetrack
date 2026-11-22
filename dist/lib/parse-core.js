/*
 * Apple Health export scanner. One implementation shared by the browser and the
 * baking script, so a file you upload and the pre-baked data go through the same code.
 *
 * Timestamps are kept as "wall clock epoch": the local time written in the export is
 * treated as if it were UTC. That keeps day/hour/weekday maths trivial and means the
 * dashboard always speaks in the phone's own local time.
 */

const DAY = 86400000;
const SESSION_GAP = 180000; // 3 min of silence ends a listening session
const MIN_SESSION = 60000;  // under a minute is a notification, not a use
const LOUD_DB = 80;
const ATTR_RE = /([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g;

const T = {
  STEPS: "HKQuantityTypeIdentifierStepCount",
  DIST: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  BASAL: "HKQuantityTypeIdentifierBasalEnergyBurned",
  ACTIVE: "HKQuantityTypeIdentifierActiveEnergyBurned",
  FLIGHTS: "HKQuantityTypeIdentifierFlightsClimbed",
  SPEED: "HKQuantityTypeIdentifierWalkingSpeed",
  STEPLEN: "HKQuantityTypeIdentifierWalkingStepLength",
  DS: "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
  ASYM: "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  STEAD: "HKQuantityTypeIdentifierAppleWalkingSteadiness",
  HR: "HKQuantityTypeIdentifierHeartRate",
  RUNSPEED: "HKQuantityTypeIdentifierRunningSpeed",
  HEIGHT: "HKQuantityTypeIdentifierHeight",
  AUDIO: "HKQuantityTypeIdentifierHeadphoneAudioExposure",
};

// key === the HealthKit type identifier, so every branch below can compare directly
const SHORT = {};
for (const k of Object.keys(T)) SHORT[T[k]] = T[k];

function attrs(line) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(line)) !== null) out[m[1]] = m[2];
  return out;
}

function unescape(s) {
  return s.indexOf("&") < 0 ? s : s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

/** "2024-06-15 17:07:14 +0800" -> wall-clock epoch ms + parts. */
export function parseWhen(s) {
  if (!s || s.length < 19) return null;
  const y = +s.slice(0, 4), mo = +s.slice(5, 7), d = +s.slice(8, 10);
  const h = +s.slice(11, 13), mi = +s.slice(14, 16), se = +s.slice(17, 19);
  if (!(y > 1900)) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, se);
  return { ms, day: s.slice(0, 10), hour: h, wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}

function dayIndex(startDay, day) {
  const a = Date.UTC(+startDay.slice(0, 4), +startDay.slice(5, 7) - 1, +startDay.slice(8, 10));
  const b = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Math.round((b - a) / DAY);
}

function deviceInfo(raw) {
  if (!raw) return null;
  const s = unescape(raw);
  const grab = (key) => {
    const i = s.indexOf(", " + key + ":");
    if (i < 0) return "";
    const rest = s.slice(i + key.length + 3);
    const j = rest.indexOf(", ");
    return (j < 0 ? rest.replace(/>>$/, "") : rest.slice(0, j)).trim();
  };
  return {
    name: grab("name") || "?",
    model: grab("model") || "",
    mac: grab("localIdentifier") || "",
  };
}

export class Collector {
  constructor() {
    this.meta = { me: {}, exportDate: null };
    this.stats = new Map();
    this.daily = new Map();
    this.devs = new Map();
    this.rings = [];
    this.workouts = [];
    this.wk = null;
    this.tail = "";
    this.lines = 0;
    this.sources = new Map();
    this.recDay = new Map();
    this.records = 0;
  }

  feed(text) {
    const s = this.tail + text;
    let start = 0, i = 0;
    while ((i = s.indexOf("\n", start)) >= 0) {
      this.line(s.slice(start, i));
      start = i + 1;
    }
    this.tail = s.slice(start);
  }

  line(raw) {
    this.lines++;
    let p = 0;
    const n = raw.length;
    while (p < n && raw.charCodeAt(p) === 32) p++;
    if (p >= n || raw.charCodeAt(p) !== 60) return;
    const c = raw.charCodeAt(p + 1);
    if (c === 82) { // R
      if (raw.startsWith("<Record ", p)) this.record(raw.slice(p));
    } else if (c === 87) { // W
      if (raw.startsWith("<Workout ", p)) this.workoutStart(raw.slice(p));
      else if (raw.startsWith("<WorkoutStatistics ", p)) this.workoutStat(raw.slice(p));
      else if (raw.startsWith("</Workout>", p)) this.wk = null;
    } else if (c === 77) { // M
      if (raw.startsWith("<Me ", p)) { const a = attrs(raw); this.meta.me = a; }
      else if (raw.startsWith("<MetadataEntry ", p) && this.wk) this.workoutMeta(raw.slice(p));
    } else if (c === 69) { // E
      if (raw.startsWith("<ExportDate ", p)) this.meta.exportDate = attrs(raw).value || null;
    } else if (c === 65) { // A
      if (raw.startsWith("<ActivitySummary ", p)) this.activity(attrs(raw));
    }
  }

  record(line) {
    const a = attrs(line);
    const type = a.type;
    if (!type) return;
    const key = SHORT[type];
    let st = this.stats.get(type);
    if (!st) {
      st = { type, key: key || type, unit: a.unit || "", n: 0, days: new Set(), first: 0, last: 0, sum: 0, cnt: 0, min: Infinity, max: -Infinity };
      this.stats.set(type, st);
    }
    st.n++;
    this.records++;
    if (!st.unit && a.unit) st.unit = a.unit;
    const src = a.sourceName;
    if (src) this.sources.set(src, (this.sources.get(src) || 0) + 1);

    const when = parseWhen(a.startDate);
    if (!when) return;
    this.recDay.set(when.day, (this.recDay.get(when.day) || 0) + 1);
    if (!st.first || when.ms < st.first) st.first = when.ms;
    if (when.ms > st.last) st.last = when.ms;
    st.days.add(when.day);

    const v = a.value === undefined ? NaN : +a.value;
    if (Number.isFinite(v)) {
      st.sum += v; st.cnt++;
      if (v < st.min) st.min = v;
      if (v > st.max) st.max = v;
    }

    if (key === T.AUDIO) {
      const dev = deviceInfo(a.device);
      if (dev) {
        const dk = dev.name + "|" + dev.model + "|" + dev.mac;
        let d = this.devs.get(dk);
        if (!d) {
          d = { name: dev.name, model: dev.model, mac: dev.mac, raw: [], n: 0, loud: 0 };
          this.devs.set(dk, d);
        }
        d.n++;
        const end = parseWhen(a.endDate);
        if (end && Number.isFinite(v)) {
          d.raw.push([when.ms, Math.max(when.ms + 1000, end.ms), v]);
          if (v >= LOUD_DB) d.loud++;
        }
      }
      return;
    }

    if (!key) return;
    const val = Number.isFinite(v) ? v : 0;
    let day = this.daily.get(when.day);
    if (!day) { day = { d: when.day, n: 0 }; this.daily.set(when.day, day); }
    day.n++;

    switch (key) {
      case T.STEPS: day.st = (day.st || 0) + val; break;
      case T.DIST: day.di = (day.di || 0) + val; break;
      case T.ACTIVE: day.ac = (day.ac || 0) + val; break;
      case T.BASAL: day.ba = (day.ba || 0) + val; break;
      case T.FLIGHTS: day.fl = (day.fl || 0) + val; break;
      case T.SPEED: case T.STEPLEN: case T.DS: case T.ASYM: case T.STEAD: {
        const f = { [T.SPEED]: "sp", [T.STEPLEN]: "sl", [T.DS]: "ds", [T.ASYM]: "ay", [T.STEAD]: "sd" }[key];
        const sum = (day[f + "s"] || 0) + val;
        day[f + "s"] = sum;
        day[f + "n"] = (day[f + "n"] || 0) + 1;
        break;
      }
      case T.HR: {
        day.hr = (day.hr || 0) + val;
        day.hrn = (day.hrn || 0) + 1;
        day.hrmin = Math.min(day.hrmin === undefined ? Infinity : day.hrmin, val);
        day.hrmax = Math.max(day.hrmax === undefined ? -Infinity : day.hrmax, val);
        break;
      }
    }
  }

  workoutStart(line) {
    const a = attrs(line);
    this.wk = {
      type: (a.workoutActivityType || "").replace("HKWorkoutActivityType", ""),
      start: a.startDate || "", end: a.endDate || "",
      dur: +(a.duration || 0), unit: a.durationUnit || "min",
      src: a.sourceName || "", stats: {}, meta: {},
    };
    this.workouts.push(this.wk);
  }

  workoutStat(line) {
    if (!this.wk) return;
    const a = attrs(line);
    this.wk.stats[(a.type || "").replace("HKQuantityTypeIdentifier", "")] = a;
  }

  workoutMeta(line) {
    const a = attrs(line);
    if (this.wk && a.key) this.wk.meta[a.key] = a.value;
  }

  activity(a) {
    if (!a.dateComponents) return;
    this.rings.push([a.dateComponents, +a.activeEnergyBurned || 0, +a.activeEnergyBurnedGoal || 0]);
  }

  /* ------------------------------------------------------------------ */

  finish() {
    // devices + sessions
    const devices = [];
    const sessions = [];
    const GAP = SESSION_GAP;
    let di = 0;
    // A repaired headset shows up under a new MAC but is the same product.
    const grouped = new Map();
    for (const d of this.devs.values()) {
      const k = d.name + "|" + d.model;
      const g = grouped.get(k);
      if (g) { g.raw.push(...d.raw); g.n += d.n; g.loud += d.loud; }
      else grouped.set(k, { name: d.name, model: d.model, mac: d.mac, raw: d.raw.slice(), n: d.n, loud: d.loud });
    }
    for (const d of grouped.values()) {
      const raw = d.raw.sort((x, y) => x[0] - y[0]);
      const merged = [];
      let cur = null;
      for (const [s, e, db] of raw) {
        if (cur && s - cur[1] <= GAP) {
          if (e > cur[1]) cur[1] = e;
          cur[2].push(db);
          cur[3] += 1;
        } else {
          if (cur) merged.push(cur);
          cur = [s, e, [db], 1];
        }
      }
      if (cur) merged.push(cur);

      let seconds = 0, longest = 0, dbWeighted = 0, dbMax = 0, loudSec = 0, count = 0;
      let first = 0, last = 0;
      const out = [];
      for (const [s, e, dbs, cnt] of merged) {
        const len = e - s;
        if (len < MIN_SESSION) continue;
        let sum = 0;
        for (const x of dbs) sum += x;
        const avg = sum / dbs.length;
        count++;
        seconds += len / 1000;
        if (len > longest) longest = len;
        dbWeighted += avg * len;
        for (const x of dbs) if (x > dbMax) dbMax = x;
        if (avg >= LOUD_DB) loudSec += len / 1000;
        if (!first) first = s;
        last = Math.max(last, e);
        out.push([s, e, Math.round(avg * 10) / 10, di]);
        void cnt;
      }
      sessions.push(...out);
      devices.push({
        id: di, name: d.name, model: d.model, mac: d.mac, samples: d.n,
        seconds: Math.round(seconds), sessions: count,
        longest: Math.round(longest / 1000),
        dbAvg: seconds ? Math.round((dbWeighted / (seconds * 1000)) * 10) / 10 : 0,
        dbMax: Math.round(dbMax * 10) / 10,
        loudSec: Math.round(loudSec), loud: d.loud,
        first, last,
      });
      di++;
    }
    sessions.sort((a, b) => a[0] - b[0]);
    devices.sort((a, b) => b.seconds - a.seconds);

    // hour / weekday / loudness distributions, weighted by listening duration
    const hours = new Array(24).fill(0);
    const week = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const dbBuckets = {};
    let totalSec = 0;
    for (const [s, e, db] of sessions) {
      totalSec += (e - s) / 1000;
      const bucket = Math.floor(db / 5) * 5;
      dbBuckets[bucket] = (dbBuckets[bucket] || 0) + (e - s) / 1000;
      let cur = s;
      while (cur < e) {
        const dt = new Date(cur);
        const hour = dt.getUTCHours();
        const wd = dt.getUTCDay();
        const stop = Math.min(e, cur - (cur % 3600000) + 3600000);
        const span = (stop - cur) / 1000;
        hours[hour] += span;
        week[wd][hour] += span;
        cur = stop;
      }
    }

    // day series
    const dayKeys = [...this.daily.keys(), ...this.rings.map((r) => r[0]), ...this.recDay.keys()].sort();
    const start = dayKeys[0];
    const end = dayKeys[dayKeys.length - 1];
    const startDayMs = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
    const count = dayIndex(start, end) + 1;
    const mk = () => new Array(count).fill(null);
    const S = { start, end, count,
      steps: mk(), dist: mk(), active: mk(), basal: mk(), flights: mk(),
      speed: mk(), steplen: mk(), ds: mk(), asym: mk(), stead: mk(),
      hr: mk(), hrN: mk(), hrMin: mk(), hrMax: mk(), listen: mk(), rec: mk() };
    for (const [k, day] of this.daily) {
      const i = dayIndex(start, k);
      if (day.st !== undefined) S.steps[i] = Math.round(day.st);
      if (day.di !== undefined) S.dist[i] = Math.round(day.di * 100) / 100;
      if (day.ac !== undefined) S.active[i] = Math.round(day.ac);
      if (day.ba !== undefined) S.basal[i] = Math.round(day.ba);
      if (day.fl !== undefined) S.flights[i] = Math.round(day.fl);
      const avg = (s, n) => (day[n] ? Math.round((day[s] / day[n]) * 1000) / 1000 : null);
      if (day.spn) S.speed[i] = avg("sps", "spn");
      if (day.sln) S.steplen[i] = avg("sls", "sln");
      if (day.dsn) S.ds[i] = avg("dss", "dsn");
      if (day.ayn) S.asym[i] = avg("ays", "ayn");
      if (day.sdn) S.stead[i] = avg("sds", "sdn");
      if (day.hrn) {
        S.hr[i] = Math.round(day.hr / day.hrn);
        S.hrN[i] = day.hrn;
        S.hrMin[i] = Math.round(day.hrmin);
        S.hrMax[i] = Math.round(day.hrmax);
      }
    }
    // records per day
    for (const [k, v] of this.recDay) {
      const i = dayIndex(start, k);
      if (i >= 0 && i < count) S.rec[i] = v;
    }

    // listening seconds per day
    for (const [s, e] of sessions) {
      let cur = s;
      while (cur < e) {
        const stop = Math.min(e, cur - (cur % DAY) + DAY);
        const i = Math.floor((cur - (cur % DAY)) / DAY) - Math.floor(startDayMs / DAY);
        if (i >= 0 && i < count) S.listen[i] = (S.listen[i] || 0) + Math.round((stop - cur) / 1000);
        cur = stop;
      }
    }

    const coverage = [...this.stats.values()].map((st) => ({
      type: st.type, key: st.key, unit: st.unit, n: st.n, days: st.days.size,
      first: st.first || null, last: st.last || null,
      avg: st.cnt ? st.sum / st.cnt : null,
      max: st.max === -Infinity ? null : st.max,
      min: st.min === Infinity ? null : st.min,
      total: st.sum,
    })).sort((a, b) => b.n - a.n);

    const workouts = this.workouts.map((w) => {
      const st = w.stats;
      const num = (k, f) => {
        const v = st[k] && st[k][f];
        return v === undefined ? null : +v;
      };
      const dist = num("DistanceWalkingRunning", "sum");
      const kcal = num("ActiveEnergyBurned", "sum");
      const elev = w.meta.HKElevationAscended ? parseFloat(w.meta.HKElevationAscended) / 100 : null;
      const when = parseWhen(w.start);
      return {
        date: when ? when.day : "", type: w.type, dur: w.dur,
        dist: dist === null ? null : Math.round(dist * 1000) / 1000,
        kcal: kcal === null ? null : Math.round(kcal),
        elev: elev === null ? null : Math.round(elev),
        mets: w.meta.HKAverageMETs ? parseFloat(w.meta.HKAverageMETs) : null,
        speed: num("RunningSpeed", "average"),
        steps: num("StepCount", "sum"),
      };
    }).sort((a, b) => (a.date < b.date ? -1 : 1));

    const rings = this.rings.map(([d, v, g]) => [dayIndex(start, d), Math.round(v), Math.round(g)])
      .filter((r) => r[0] >= 0 && r[0] < count);

    return {
      meta: {
        exportDate: this.meta.exportDate,
        me: {
          dob: this.meta.me.HKCharacteristicTypeIdentifierDateOfBirth || "",
          sex: this.meta.me.HKCharacteristicTypeIdentifierBiologicalSex || "",
          blood: this.meta.me.HKCharacteristicTypeIdentifierBloodType || "",
          skin: this.meta.me.HKCharacteristicTypeIdentifierFitzpatrickSkinType || "",
        },
        start, end, days: count,
        records: coverage.reduce((s, c) => s + c.n, 0),
        types: coverage.length,
        workouts: workouts.length,
        sources: [...this.sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      },
      devices,
      sessions,
      hours,
      week,
      audio: { buckets: dbBuckets, seconds: Math.round(totalSec) },
      days: S,
      rings,
      workouts,
      coverage,
    };
  }
}
