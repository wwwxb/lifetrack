/* LifeTrack controller: parse → compute → four sections. */

import { I18n, t } from "./lib/i18n.js";
import * as Ch from "./lib/charts.js";
import { scanFile, fail, supportsDeflateRaw } from "./lib/scan.js";
import * as Skins from "./lib/skins.js";

const DAY = 86400000;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ICON_PHONES = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="13.5" width="4.5" height="7" rx="2.2"/><rect x="17" y="13.5" width="4.5" height="7" rx="2.2"/></svg>`;
const ICON_PHONES_BIG = `<svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="13.5" width="4.5" height="7" rx="2.2"/><rect x="17" y="13.5" width="4.5" height="7" rx="2.2"/></svg>`;

const state = {
  data: null,
  dev: "all",
  preset: "all",
  from: 0,
  to: 0,
  lang: "zh",
  section: "summary",
  cancel: null,
  demo: false,
};

let lastCtx = null;
let fullCtx = null;

/* ---------------- formatting ---------------- */

const fInt = (n) => (n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("en-US"));
const f1 = (n, d = 1) => (n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wan(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 10000) return state.lang === "en" ? (n / 1000).toFixed(1) + "k" : (n / 10000).toFixed(1) + "万";
  return fInt(n);
}

function startMs() {
  const s = state.data.meta.start;
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}
const dayDate = (i) => new Date(startMs() + i * DAY);
function fmtDay(i) {
  const d = dayDate(i);
  return d.getUTCFullYear() + "." + String(d.getUTCMonth() + 1).padStart(2, "0") + "." + String(d.getUTCDate()).padStart(2, "0");
}
function fmtDayCn(i) {
  const d = dayDate(i);
  return state.lang === "en" ? MON[d.getUTCMonth()] + " " + d.getUTCDate() : (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日";
}
const fmtMonth = (i) => (state.lang === "en" ? MON[dayDate(i).getUTCMonth()] : dayDate(i).getUTCMonth() + 1 + "月");
function isoDay(i) {
  const d = dayDate(i);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function isoFromMs(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function dayIdxOf(day) {
  if (!day) return -1;
  const p = day.split("-").map(Number);
  return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - startMs()) / DAY);
}
function dayIdxFromIso(v) {
  if (!v) return null;
  const p = v.split("-").map(Number);
  if (p.length !== 3 || !p[0]) return null;
  return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - startMs()) / DAY);
}

function durParts(sec) {
  const m = Math.round(sec / 60);
  return { h: Math.floor(m / 60), m: m % 60 };
}
function durText(sec) {
  const { h, m } = durParts(sec);
  if (h >= 10) return `${fInt(h)} ${t("unit.h")}`;
  if (h >= 1) return `${h} ${t("unit.h")} ${m} ${t("unit.m")}`;
  return `${Math.max(1, m)} ${t("unit.m")}`;
}
function compactDur(sec) {
  const { h, m } = durParts(sec);
  if (h === 0) return `${m}${t("unit.m")}`;
  return state.lang === "en" ? `${h}h ${m}m` : `${h}时${m}分`;
}
const shortDur = (sec) => {
  const { h, m } = durParts(sec);
  return h ? `${h} ${t("unit.h")} ${m} ${t("unit.m")}` : `${m} ${t("unit.m")}`;
};

/* ---------------- range + compute ---------------- */

function audioSpan() {
  const sess = state.data.sessions;
  if (!sess.length) return null;
  return {
    from: Math.max(0, Math.floor((sess[0][0] - startMs()) / DAY)),
    to: Math.min(state.data.days.count - 1, Math.floor((sess[sess.length - 1][0] - startMs()) / DAY)),
  };
}

function currentRange() {
  const n = state.data.days.count;
  const end = n - 1;
  let from = 0, to = end;
  const p = state.preset;
  if (p === "1y") from = Math.max(0, end - 364);
  else if (p === "90") from = Math.max(0, end - 89);
  else if (p === "30") from = Math.max(0, end - 29);
  else if (p === "7") from = Math.max(0, end - 6);
  else if (p === "custom") { from = state.from; to = state.to; }
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

/** Audio cards keep their own window: the listening span clipped by the chosen range. */
function audioWindow(range) {
  const sp = audioSpan();
  if (!sp) return null;
  const from = Math.max(range.from, sp.from);
  const to = Math.min(range.to, sp.to);
  return from <= to ? { from, to } : { from: sp.from, to: sp.to };
}

function compute(bounds) {
  const d = state.data;
  const { from, to } = bounds;
  const lo = startMs() + from * DAY;
  const hi = startMs() + (to + 1) * DAY;
  const devId = state.dev === "all" ? null : state.dev;

  const sess = d.sessions.filter((s) => s[0] >= lo && s[0] < hi && (devId === null || s[3] === devId));
  const listenByDay = new Array(to - from + 1).fill(0);
  const hours = new Array(24).fill(0);
  const week = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let total = 0, longest = 0, dbW = 0, loud = 0, sessions = 0;

  for (const [s, e, db] of sess) {
    const len = (e - s) / 1000;
    total += len;
    sessions++;
    longest = Math.max(longest, len);
    dbW += db * len;
    if (db >= 80) loud += len;
    let cur = s;
    while (cur < e) {
      const dt = new Date(cur);
      const stop = Math.min(e, cur - (cur % 3600000) + 3600000);
      const span = (stop - cur) / 1000;
      hours[dt.getUTCHours()] += span;
      week[dt.getUTCDay()][dt.getUTCHours()] += span;
      cur = stop;
    }
    let cur2 = s;
    while (cur2 < e) {
      const stop = Math.min(e, cur2 - (cur2 % DAY) + DAY);
      const i = Math.floor((cur2 - (cur2 % DAY)) / DAY) - Math.floor(startMs() / DAY) - from;
      if (i >= 0 && i < listenByDay.length) listenByDay[i] += (stop - cur2) / 1000;
      cur2 = stop;
    }
  }

  const slice = (arr) => arr.slice(from, to + 1);
  const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
  const avgArr = (a) => {
    const v = a.filter((x) => x !== null && x !== undefined);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const argmax = (a) => {
    let bi = -1, bv = -Infinity;
    a.forEach((v, i) => { if ((v || 0) > bv) { bv = v || 0; bi = i; } });
    return bi >= 0 ? { i: bi, v: bv } : null;
  };

  const rec = slice(d.days.rec || []);
  const steps = slice(d.days.steps);
  const dist = slice(d.days.dist);
  const active = slice(d.days.active);
  const basal = slice(d.days.basal);
  const flights = slice(d.days.flights);
  const hr = slice(d.days.hr);
  const stepsDays = steps.filter((v) => v !== null && v > 0).length;
  const activeDays = listenByDay.filter((v) => v > 0).length;
  const rings = (d.rings || []).filter((r) => r[0] >= from && r[0] <= to);

  const workouts = (d.workouts || []).map((w) => ({ ...w, idx: dayIdxOf(w.date) })).filter((w) => w.idx >= from && w.idx <= to);

  return {
    from, to, dayCount: to - from + 1,
    sess, listenByDay, hours, week,
    listen: total, longest, sessions, avgDb: total ? dbW / total : 0, loudSec: loud,
    activeDays,
    busiest: argmax(listenByDay),
    steps, dist, active, basal, flights, hr,
    recordsTotal: sum(rec),
    daysWithRecords: rec.filter((v) => v > 0).length,
    stepsTotal: sum(steps), distTotal: sum(dist), activeTotal: sum(active), basalTotal: sum(basal), flightsTotal: sum(flights),
    stepsAvg: stepsDays ? sum(steps) / stepsDays : 0,
    stepsDays,
    bestStep: argmax(steps),
    speed: avgArr(slice(d.days.speed)), steplen: avgArr(slice(d.days.steplen)),
    ds: avgArr(slice(d.days.ds)), asym: avgArr(slice(d.days.asym)), stead: avgArr(slice(d.days.stead)),
    hrAvg: avgArr(hr),
    rings, ringsClosed: rings.filter((r) => r[1] >= r[2]).length, ringsDays: rings.length,
    workouts,
  };
}

function trimToData(values, startIdx) {
  let a = 0, b = values.length - 1;
  while (a < values.length && values[a] == null) a++;
  while (b >= 0 && values[b] == null) b--;
  if (a > b) return null;
  return { values: values.slice(a, b + 1), from: startIdx + a, to: startIdx + b };
}

function bucketSeries(values, span) {
  const n = values.length;
  let size = 1;
  if (span > 400) size = 30;
  else if (span > 90) size = 7;
  const out = [];
  for (let i = 0; i < n; i += size) {
    let s = 0;
    for (let k = i; k < Math.min(n, i + size); k++) if (values[k] != null) s += values[k];
    out.push(size === 1 ? s : s / size);
  }
  return { values: out, size };
}

/* ---------------- view plumbing ---------------- */

function show(view) {
  for (const id of ["intro", "busy", "dash"]) $("#" + id).hidden = id !== view;
  $("#restart").hidden = view === "intro";
  window.scrollTo(0, 0);
}

function setData(data) {
  state.data = data;
  state.preset = "all";
  state.from = 0;
  state.to = data.days.count - 1;
  state.dev = "all";
  state.section = "summary";
  show("dash");
  render();
}

function secHead(key, extra = "") {
  return `<div class="sec-head">
    <p class="eyebrow">${t("sec.eyebrow." + key)}</p>
    <h2 class="sec-title">${t("sec." + key)}</h2>
    <p class="sec-desc">${t("sec." + key + "Desc")}</p>
    ${extra}
  </div>`;
}

function filterBar(range) {
  const presets = [["all", t("period.all")], ["1y", t("period.1y")], ["90", t("period.90")], ["30", t("period.30")], ["7", t("period.7")]];
  const n = state.data.days.count;
  return `<div class="card filters">
    <div class="filter-head">
      <span class="card-title" style="font-size:15px">${t("filter.title")}</span>
      <span class="card-note" id="filterNote">${t("filter.note", { from: fmtDay(range.from), to: fmtDay(range.to), days: fInt(range.to - range.from + 1), active: fInt(countActive(range)) })}${state.demo ? " · " + (state.lang === "en" ? "demo data" : "演示数据") : ""}</span>
    </div>
    <div class="segmented" id="seg" role="tablist">
      <span class="seg-thumb" id="segThumb"></span>
      ${presets.map(([k, label]) => `<button role="tab" data-preset="${k}" class="${state.preset === k ? "on" : ""}">${label}</button>`).join("")}
    </div>
    <div class="range-row">
      <input class="range-pill" type="date" id="fromDate" value="${isoDay(range.from)}" min="${isoDay(0)}" max="${isoDay(n - 1)}" aria-label="${t("range.from")}">
      <span class="range-arrow">→</span>
      <input class="range-pill" type="date" id="toDate" value="${isoDay(range.to)}" min="${isoDay(0)}" max="${isoDay(n - 1)}" aria-label="${t("range.to")}">
    </div>
  </div>`;
}

function countActive(range) {
  const rec = state.data.days.rec || [];
  let n = 0;
  for (let i = range.from; i <= range.to; i++) if ((rec[i] || 0) > 0) n++;
  return n;
}

function sectionNav() {
  const items = ["summary", "steps", "audio", "vitals"];
  const cls = state.data.sessions.length ? "" : " muted";
  return `<nav class="secnav${cls}" role="tablist" aria-label="Sections">
    ${items.map((k) => {
      const off = k === "audio" && !state.data.sessions.length;
      return `<button role="tab" class="secnav-btn ${state.section === k ? "on" : ""}" data-section="${k}" ${off ? "disabled" : ""}>
        ${t("sec." + k)}
      </button>`;
    }).join("")}
  </nav>`;
}

/* ---------------- section 1: all records ---------------- */

const PCT_TYPES = new Set(["WalkingDoubleSupportPercentage", "WalkingAsymmetryPercentage", "AppleWalkingSteadiness"]);
const UNIT_MAP = { dBASPL: "dB", "count/min": "bpm", "km/hr": "km/h", count: "", "%": "%" };

function covName(key) {
  const k = key.replace("HKQuantityTypeIdentifier", "");
  return t("type." + k) !== "type." + k ? t("type." + k) : k;
}

function viaPct(key, v) {
  return PCT_TYPES.has(key.replace("HKQuantityTypeIdentifier", "")) ? v * 100 : v;
}

function cumulativeOf(row) {
  const key = row.key.replace("HKQuantityTypeIdentifier", "");
  const total = row.total || 0;
  switch (key) {
    case "StepCount": return wan(total) + " " + t("unit.steps");
    case "DistanceWalkingRunning": return fInt(total) + " " + t("unit.km");
    case "ActiveEnergyBurned":
    case "BasalEnergyBurned": return wan(total) + " " + t("unit.kcal");
    case "FlightsClimbed": return fInt(total) + " " + t("unit.floors");
    case "HeadphoneAudioExposure": return wan((state.data.audio ? state.data.audio.seconds : 0) / 3600) + " " + t("unit.h");
    default: return "—";
  }
}

function typesInRange(g) {
  const lo = startMs() + g.from * DAY;
  const hi = startMs() + (g.to + 1) * DAY;
  return state.data.coverage.filter((c) => c.first != null && c.first < hi && c.last >= lo).length;
}

function spanText(days) {
  if (days < 60) return t("sum.spanDays", { n: fInt(days) });
  if (days < 730) return t("sum.spanMonths", { n: Math.round(days / 30.44) });
  const y = days / 365.25;
  return t("sum.spanValue", { y: y >= 9.95 ? Math.round(y) : y.toFixed(1) });
}

function summarySection(g) {
  const d = state.data;
  const rows = d.coverage;
  const maxN = Math.max(...rows.map((r) => r.n));

  const ringData = rows.slice(0, 8).map((r) => ({ name: covName(r.key), value: r.n }));
  const restN = rows.slice(8).reduce((s, r) => s + r.n, 0);
  if (restN) ringData.push({ name: t("sum.other"), value: restN });
  const totalN = rows.reduce((s, r) => s + r.n, 0);

  return `<div class="sec-body">
    <div class="card stat-strip full">
      ${[
        [fInt(g.recordsTotal), t("sum.records")],
        [String(typesInRange(g)), t("sum.types")],
        [fInt(g.daysWithRecords), t("sum.days")],
        [spanText(g.dayCount), t("sum.span")],
      ].map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("")}
      <p class="figure-sub stat-note">${t("sum.scopeNote")}</p>
    </div>

    ${portraitCard(g)}

    <div class="card ring-card full">
      <div class="card-head">
        <h3 class="card-title">${t("sum.ringTitle")}</h3>
        <span class="card-note">${t("sum.ringNote")}</span>
      </div>
      <div class="ring-wrap">
        <div class="ring-chart">${Ch.donut({ size: 190, data: ringData, centerValue: wan(totalN), centerLabel: t("sum.ringCenter"), aria: "record composition" })}</div>
        <ul class="ring-legend">
          ${ringData.map((r, i) => `<li>
            <i style="background:hsl(var(--tint)/${Math.max(0.24, 0.95 - i * 0.085).toFixed(2)})"></i>
            <span class="rl-name">${esc(r.name)}</span>
            <span class="rl-val">${fInt(r.value)}</span>
            <span class="rl-pct">${((r.value / totalN) * 100).toFixed(1)}%</span>
          </li>`).join("")}
        </ul>
      </div>
    </div>

    <div class="card full">
      <div class="card-head">
        <h3 class="card-title">${t("sum.tableTitle")}</h3>
        <span class="card-note">${t("sum.tableNote", { n: d.meta.types, r: fInt(d.meta.records) })}</span>
      </div>
      <div class="scroll-x sum-tbl-wrap">
        <table class="tbl sum-tbl">
          <thead><tr>
            <th>${t("coverage.type")}</th>
            <th class="bar-head">${t("coverage.count")}</th>
            <th class="num">${t("coverage.days")}</th>
            <th class="num">${t("coverage.total")}</th>
            <th class="num">${t("coverage.avg")}</th>
            <th class="num">${t("coverage.max")}</th>
          </tr></thead>
          <tbody>
          ${rows.map((r) => {
            const key = r.key.replace("HKQuantityTypeIdentifier", "");
            const pct = PCT_TYPES.has(key);
            const avgV = r.avg == null ? null : viaPct(r.key, r.avg);
            const maxV = r.max == null ? null : viaPct(r.key, r.max);
            const unit = pct ? "%" : UNIT_MAP[r.unit] !== undefined ? UNIT_MAP[r.unit] : r.unit;
            const fmtV = (v) => (v == null ? "—" : pct ? f1(v, 1) : v >= 100 ? fInt(v) : f1(v, v < 10 ? 2 : 1));
            return `<tr>
              <td class="cat">${esc(covName(r.key))}</td>
              <td class="bar-cell">
                <span class="bar-track"><i style="width:${Math.max(2, (r.n / maxN) * 100).toFixed(1)}%"></i></span>
                <span class="bar-num">${fInt(r.n)}</span>
              </td>
              <td class="num">${fInt(r.days)}</td>
              <td class="num">${cumulativeOf(r)}</td>
              <td class="num">${fmtV(avgV)}${unit && avgV != null ? (unit === "%" ? "" : " ") + unit : ""}</td>
              <td class="num">${fmtV(maxV)}${unit && maxV != null ? (unit === "%" ? "" : " ") + unit : ""}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>
      <div class="sum-cards">
        ${rows.map((r) => {
          const key = r.key.replace("HKQuantityTypeIdentifier", "");
          const pct = PCT_TYPES.has(key);
          const avgV = r.avg == null ? null : viaPct(r.key, r.avg);
          const maxV = r.max == null ? null : viaPct(r.key, r.max);
          const unit = pct ? "%" : UNIT_MAP[r.unit] !== undefined ? UNIT_MAP[r.unit] : r.unit;
          const fmtV = (v) => (v == null ? "—" : pct ? f1(v, 1) : v >= 100 ? fInt(v) : f1(v, v < 10 ? 2 : 1));
          return `<div class="sum-item">
            <div class="sum-item-head"><b>${esc(covName(r.key))}</b><span>${fInt(r.n)}</span></div>
            <div class="sum-item-bar"><i style="width:${Math.max(2, (r.n / maxN) * 100).toFixed(1)}%"></i></div>
            <div class="sum-item-grid">
              <div><span>${t("coverage.days")}</span><b>${fInt(r.days)}</b></div>
              <div><span>${t("coverage.total")}</span><b>${cumulativeOf(r)}</b></div>
              <div><span>${t("coverage.avg")}</span><b>${fmtV(avgV)}${unit && avgV != null ? (unit === "%" ? "" : " ") + unit : ""}</b></div>
              <div><span>${t("coverage.max")}</span><b>${fmtV(maxV)}${unit && maxV != null ? (unit === "%" ? "" : " ") + unit : ""}</b></div>
            </div>
          </div>`;
        }).join("")}
      </div>
      <p class="figure-sub" style="margin-top:12px">${t("coverage.missingText")}</p>
    </div>

  </div>`;
}

function portraitCard(g) {
  const d = state.data;
  const life = fullCtx || g;
  const hours = (d.audio ? d.audio.seconds : 0) / 3600;
  const km = (d.days.dist || []).reduce((s, v) => s + (v || 0), 0);
  const steps = (d.days.steps || []).reduce((s, v) => s + (v || 0), 0);
  const text = t("portrait.text", {
    steps: fInt(steps), km: fInt(km), hours: fInt(hours),
    db: f1(life.avgDb || 0, 1), speed: f1(life.speed || 0, 2),
    steady: f1((life.stead || 0) * 100, 1),
  });
  return `<div class="card portrait full" id="portrait">
    <div class="card-head">
      <h3 class="card-title">${t("portrait.title")}</h3>
      <span class="card-note">${t("portrait.note")}</span>
    </div>
    <p class="portrait-text">${text}</p>
    <p class="portrait-thin">${t("portrait.thin")}</p>
  </div>`;
}

/* ---------------- section 2: on foot ---------------- */

function windowSum(arr, days) {
  const from = Math.max(0, arr.length - days);
  let s = 0, n = 0;
  for (let i = from; i < arr.length; i++) if (arr[i] != null) { s += arr[i]; n++; }
  return { total: s, days: n };
}

function stepsSection(g) {
  const d = state.data;
  const all = d.days;
  const endIdx = all.count - 1;
  let allTotal = 0, allDays = 0;
  for (const v of all.steps) if (v != null) { allTotal += v; allDays++; }
  const yearStart = dayIdxOf(isoFromMs(Date.UTC(dayDate(endIdx).getUTCFullYear(), 0, 1)));
  let yTotal = 0, yDays = 0;
  for (let i = Math.max(0, yearStart); i <= endIdx; i++) if (all.steps[i] != null) { yTotal += all.steps[i]; yDays++; }
  const w6 = windowSum(all.steps, 183);
  const w30 = windowSum(all.steps, 30);
  const w7 = windowSum(all.steps, 7);

  const periods = [
    { k: "st.year", v: yTotal, days: yDays, note: String(dayDate(endIdx).getUTCFullYear()) },
    { k: "st.6m", v: w6.total, days: w6.days, note: "" },
    { k: "st.30", v: w30.total, days: w30.days, note: "" },
    { k: "st.7", v: w7.total, days: w7.days, note: "" },
    { k: "st.all", v: allTotal, days: allDays, note: "", all: true },
  ];

  return `<div class="sec-body">
    <div class="card period-card full">
      <div class="period-grid">
        ${periods.map((p) => `<div class="period${p.all ? " all" : ""}">
          <div class="period-label">${t(p.k)}</div>
          <div class="period-value">${fInt(p.v)}<small>${t("unit.steps")}</small></div>
          <div class="period-foot">${t("st.perDay", { n: fInt(p.days ? p.v / p.days : 0) })}${p.note ? " · " + p.note : ""}</div>
        </div>`).join("")}
      </div>
    </div>

    ${yearbookCard()}

    <div class="card full">
      <div class="card-head">
        <h3 class="card-title">${t("st.trend12")}</h3>
        <span class="card-note">${t("st.trend12Note")}</span>
      </div>
      <div class="chart" data-c="st12"></div>
    </div>

    <div class="metric-grid full">
      ${metricCard("dist", t("st.dist"), wan(g.distTotal), t("unit.km"))}
      ${metricCard("steplen", t("st.steplen"), f1(g.steplen, 1), t("unit.cm"), trimToData(d.days.steplen.slice(g.from, g.to + 1), g.from))}
      ${metricCard("speed", t("st.speed"), f1(g.speed, 2), t("unit.kmh"), trimToData(d.days.speed.slice(g.from, g.to + 1), g.from))}
      ${metricCard("flights", t("st.flights"), fInt(g.flightsTotal), t("unit.floors"))}
    </div>

    ${runsCard()}
  </div>`;
}

function metricCard(id, title, value, unit, span) {
  const a = span ? ` data-span-from="${span.from}" data-span-to="${span.to}"` : "";
  return `<div class="card metric-card"${a}>
    <div class="metric-head">
      <span class="metric-label">${title}</span>
      <span class="metric-value">${value}<small>${unit}</small></span>
    </div>
    <div class="chart" data-c="${id}"></div>
    <div class="axis"><span class="js-axis-from"></span><span class="js-axis-to"></span></div>
  </div>`;
}

function runsCard() {
  const runs = (state.data.workouts || []).filter((w) => w.type === "Running").slice(-6).reverse();
  const routes = new Map((state.data.routes || []).map((r) => [r.d, r]));
  if (!runs.length) return "";
  return `<div class="card full">
    <div class="card-head">
      <h3 class="card-title">${t("st.runs")}</h3>
      <span class="card-note">${t("st.runsNote", { n: runs.length })}</span>
    </div>
    <div class="runs">
      ${runs.map((w) => {
        const r = routes.get(w.date);
        const pace = w.dist && w.dist > 0.2 ? w.dur / w.dist : null;
        const pm = pace ? `${Math.floor(pace)}′${String(Math.round((pace % 1) * 60)).padStart(2, "0")}″` : "—";
        return `<div class="run">
          <div class="run-map">${r ? Ch.routeMap({ pts: r.pts, size: 96 }) : `<span class="run-nomap">${t("workout.noRoute")}</span>`}</div>
          <div class="run-meta">
            <div class="run-date">${w.date}</div>
            <div class="run-dist">${f1(w.dist || 0, 2)} <small>${t("unit.km")}</small></div>
            <div class="run-sub">${Math.round(w.dur)}${t("unit.m")} · ${pm}/km</div>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function yearbookCard() {
  const all = state.data.days;
  const byYear = new Map();
  all.steps.forEach((v, i) => {
    if (v == null) return;
    const y = dayDate(i).getUTCFullYear();
    byYear.set(y, (byYear.get(y) || 0) + v);
  });
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  if (!years.length) return "";
  return `<div class="card full">
    <div class="card-head">
      <h3 class="card-title">${t("st.yearbook")}</h3>
      <span class="card-note">${t("year.note")}</span>
    </div>
    <div class="yearbook">
      ${years.map(([y, v]) => `<div class="year-card">
        <h4>${y}</h4>
        <div class="yv">${fInt(v)}<small>${t("year.steps")}</small></div>
        <div class="yl">${t("steps.avg")} ${fInt(v / 365)}</div>
      </div>`).join("")}
    </div>
  </div>`;
}

/* ---------------- section 3: listening ---------------- */

function renderChips() {
  const d = state.data;
  const totalH = d.sessions.reduce((s, x) => s + (x[1] - x[0]) / 1000, 0) / 3600;
  const parts = [`<button class="chip ${state.dev === "all" ? "on" : ""}" data-dev="all">
    <span class="chip-icon">${ICON_PHONES}</span>
    <span class="chip-body">
      <span class="chip-name">${t("nav.all")}</span>
      <span class="chip-meta">${t("nav.allMeta", { h: fInt(totalH) })}</span>
    </span></button>`];
  for (const dev of d.devices) {
    if (dev.seconds < 600) continue;
    parts.push(`<button class="chip ${state.dev === dev.id ? "on" : ""}" data-dev="${dev.id}">
      <span class="chip-icon">${ICON_PHONES}</span>
      <span class="chip-body">
        <span class="chip-name">${esc(dev.name)}</span>
        <span class="chip-meta">${t("nav.recent", { d: fmtDayCn(dayIdxOf(isoFromMs(dev.last))) })} · ${fInt(dev.seconds / 3600)} ${t("unit.h")}</span>
      </span></button>`);
  }
  return `<div class="chip-row">${parts.join("")}</div>`;
}

function audioSection(a) {
  const d = state.data;
  const dev = d.devices.find((x) => x.id === state.dev) || null;
  const first = dev ? dayIdxOf(isoFromMs(dev.first)) : Math.min(...d.devices.map((x) => dayIdxOf(isoFromMs(x.first))));
  const last = dev ? dayIdxOf(isoFromMs(dev.last)) : Math.max(...d.devices.map((x) => dayIdxOf(isoFromMs(x.last))));
  const { h, m } = durParts(a.listen);
  const share = dev && dev.seconds ? Math.round((a.listen / dev.seconds) * 100) : null;
  const series = bucketSeries(a.listenByDay, a.dayCount);
  const unit = series.size === 30 ? "month" : series.size === 7 ? "week" : "day";
  const peakDay = a.busiest ? fmtDayCn(a.from + a.busiest.i) : "—";

  return `<div class="sec-body">
    ${renderChips()}

    <div class="card hero-card full">
      <div class="hero-grid">
        <div class="hero-side">
          <div class="hero-top">
            <span class="hero-eyebrow">${t("hero.eyebrow", { n: d.devices.filter((x) => x.seconds >= 600).length, first: fmtDay(first) })}</span>
            <span class="hero-badge">${t("hero.latest", { d: fmtDay(last) })}</span>
          </div>
          <h2 class="hero-name">${dev ? esc(dev.name) : t("nav.all")}</h2>
          <div class="hero-art">${ICON_PHONES_BIG}</div>
          <p class="figure-sub" style="margin-top:10px">${t("filter.audioOnly", { d: fmtDay(a.from) })} → ${fmtDay(a.to)}</p>
        </div>
        <div class="hero-main">
          <p class="figure-label">${t("hero.figure")}</p>
          <div class="figure"><b>${fInt(h)}</b><span>${t("unit.h")}</span><b>${m}</b><span>${t("unit.m")}</span></div>
          <p class="figure-sub">${t("hero.perDay", { d: durText(a.activeDays ? a.listen / a.activeDays : 0) })}${share !== null && state.dev !== "all" ? " · " + t("hero.since", { p: share }) : ""}</p>
          <div class="chart-head"><span>${t("hero.chart" + (unit === "month" ? "Month" : unit === "week" ? "Week" : "Day"))}</span><span>${t("hero.peak", { d: peakDay })}</span></div>
          <div class="chart" data-c="hero"></div>
          <div class="axis"><span>${fmtDay(a.from)}</span><span>${fmtDay(a.to)}</span></div>
        </div>
      </div>
    </div>

    <div class="tiles full">${audioTiles(a)}</div>

    <div class="card full" id="cal">
      <div class="card-head">
        <h3 class="card-title">${t("cal.title")}</h3>
        <span class="card-note">${calNote(a)}</span>
      </div>
      <div class="chart cal" data-c="cal"></div>
      <p class="cal-tip" id="calTip">${t("cal.hint")}</p>
      <div class="cal-legend"><span>${t("cal.less")}</span>
        ${[0.06, 0.22, 0.42, 0.64, 0.9].map((o) => `<i style="background:hsl(var(--tint) / ${o})"></i>`).join("")}
        <span>${t("cal.more")}</span></div>
    </div>

    <div class="card" id="clock">
      <div class="card-head">
        <h3 class="card-title">${t("clock.title")}</h3>
        <span class="card-note">${clockNote(a)}</span>
      </div>
      <div class="clock-wrap">
        <div class="chart" data-c="clock"></div>
        <div>${clockSide(a)}</div>
      </div>
      <div class="week">${weekBars(a)}</div>
    </div>

    ${gearCard()}

    <div class="card" id="safe">
      ${safeBody(a)}
    </div>
  </div>`;
}

function calNote(a) {
  let streak = 0, best = 0;
  for (const v of a.listenByDay) { if (v > 0) { streak++; best = Math.max(best, streak); } else streak = 0; }
  return t("cal.note", { n: a.listenByDay.filter((v) => v > 0).length, s: best });
}

function clockNote(a) {
  const totals = a.week.map((row) => row.reduce((s, v) => s + v, 0));
  const max = Math.max(...a.hours);
  if (!max) return "";
  const wd = state.lang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return t("clock.busiest", { d: wd[totals.indexOf(Math.max(...totals))] });
}

function clockSide(a) {
  const max = Math.max(...a.hours);
  const peak = a.hours.indexOf(max);
  const parts = [0, 0, 0, 0];
  for (let hh = 0; hh < 24; hh++) parts[Math.floor(hh / 6)] += a.hours[hh];
  const total = a.hours.reduce((s, v) => s + v, 0) || 1;
  const names = [t("daypart.0"), t("daypart.2"), t("daypart.4"), t("daypart.6")];
  const top = parts.indexOf(Math.max(...parts));
  return `<div class="clock-big">${max > 0 ? peak : "—"}<small>${state.lang === "en" ? ":00" : " 点"}</small></div>
    <div class="clock-lines">
      <span>${max > 0 ? t("clock.range", { a: peak, b: (peak + 1) % 24 }) : ""}</span>
      <span>${t("clock.part", { p: names[top], n: Math.round((parts[top] / total) * 100) })}</span>
    </div>`;
}

function weekBars(a) {
  const totals = a.week.map((row) => row.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(...totals));
  const wd = state.lang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return totals.map((v, i) => `<div class="week-day ${i === peak ? "on" : ""}">
    <span class="week-bar" style="--o:${(0.1 + (v / max) * 0.85).toFixed(2)}"></span>
    <span>${wd[i]}</span></div>`).join("");
}

function audioTiles(a) {
  const dayAvg = a.activeDays ? a.listen / a.activeDays : 0;
  const cover = a.dayCount ? Math.round((a.activeDays / a.dayCount) * 100) : 0;
  const tiles = [
    { label: t("tile.sessions"), value: fInt(a.sessions), unit: t("unit.times"), foot: t("tile.sessionsFoot"), op: 0.16 },
    { label: t("tile.avgSession"), value: a.sessions ? compactDur(a.listen / a.sessions) : "0", unit: "", foot: t("tile.avgSessionFoot"), op: 0.2 },
    { label: t("tile.longest"), value: compactDur(a.longest), unit: "", foot: a.busiest ? fmtDayCn(a.from + a.busiest.i) : "", op: 0.24 },
    { label: t("tile.busiest"), value: a.busiest ? compactDur(a.busiest.v) : "—", unit: "", foot: a.busiest ? fmtDay(a.from + a.busiest.i) : "", op: 0.14 },
    { label: t("tile.days"), value: a.activeDays, unit: t("unit.days"), foot: t("tile.daysFoot", { p: cover }), op: 0.18 },
    { label: t("tile.dayAvg"), value: compactDur(dayAvg), unit: "", foot: t("tile.dayAvgFoot"), op: 0.12 },
  ];
  return tiles.map((x) => `<div class="tile" style="--tile-a:${x.op}">
    <div><div class="tile-label">${x.label}</div>
    <div class="tile-value">${x.value}${x.unit ? `<small>${x.unit}</small>` : ""}</div></div>
    <div class="tile-foot">${x.foot || "&nbsp;"}</div>
  </div>`).join("");
}

function gearCard() {
  const devs = state.data.devices.filter((x) => x.seconds >= 600);
  if (!devs.length) return "";
  const t0 = Math.min(...devs.map((x) => x.first));
  const t1 = Math.max(...devs.map((x) => x.last));
  const span = t1 - t0 || 1;
  const hours = devs.reduce((s, x) => s + x.seconds, 0) / 3600;
  return `<div class="card full" id="gear">
    <div class="card-head">
      <h3 class="card-title">${t("gear.title")}</h3>
      <span class="card-note">${t("gear.note", { n: devs.length, h: fInt(hours) })}</span>
    </div>
    <div class="gear">
      ${devs.map((x) => {
        const l = ((x.first - t0) / span) * 100;
        const w = Math.max(2, ((x.last - x.first) / span) * 100);
        return `<div class="gear-row">
          <div class="gear-meta"><b>${esc(x.name)}</b><span>${f1(x.seconds / 3600, 0)} ${t("unit.h")}</span></div>
          <div class="gear-bar"><span class="gear-fill" style="left:${l.toFixed(1)}%;width:${Math.min(100 - l, Math.max(1.5, w)).toFixed(1)}%"></span></div>
          <div class="gear-meta"><span class="dim">${t("gear.first", { d: fmtDay(dayIdxOf(isoFromMs(x.first))) })}</span><span class="dim">${t("gear.db", { n: f1(x.dbAvg, 0) })} · ${t("gear.sessions", { n: fInt(x.sessions) })}</span><span class="dim">${t("gear.last", { d: fmtDay(dayIdxOf(isoFromMs(x.last))) })}</span></div>
        </div>`;
      }).join("")}
    </div>
    <div class="gear-axis"><span>${fmtDay(dayIdxOf(isoFromMs(t0)))}</span><span>${fmtDay(dayIdxOf(isoFromMs(t1)))}</span></div>
  </div>`;
}

function safeBody(a) {
  const RANGES = [[30, 50], [50, 65], [65, 75], [75, 130]];
  const LABEL = ["30–50", "50–65", "65–75", "75+"];
  const buckets = [0, 0, 0, 0];
  for (const [s, e, db] of a.sess) {
    const i = RANGES.findIndex(([lo, hi]) => db >= lo && db < hi);
    if (i >= 0) buckets[i] += (e - s) / 1000;
  }
  const total = buckets.reduce((s, v) => s + v, 0) || 1;
  const avg = a.avgDb || 0;
  const pos = Math.max(0, Math.min(1, (avg - 30) / 65));
  const verdict = avg >= 70 ? "bad" : avg >= 60 ? "warn" : "ok";
  return `<div class="card-head">
      <h3 class="card-title">${t("safe.title")}</h3>
      <span class="card-note">${t("safe.note")}</span>
    </div>
    <div class="figure"><b>${f1(avg, 0)}</b><span>dB</span></div>
    <p class="figure-sub">${t("safe.over")} · ${t("safe.overSec", { m: fInt(a.loudSec / 60) })}</p>
    <div class="meter" aria-hidden="true">
      <div class="meter-track"></div>
      <div class="meter-dot" style="left:${(pos * 100).toFixed(1)}%"></div>
    </div>
    <div class="meter-scale"><span>30</span><span>45</span><span>60</span><span>75</span><span>95</span></div>
    <div class="db-bands">
      ${RANGES.map(([lo, hi], i) => {
        const sharePct = (buckets[i] / total) * 100;
        return `<div class="db-band"><span>${LABEL[i]} dB</span><span class="bar"><i style="width:${sharePct.toFixed(1)}%"></i></span><span style="text-align:right">${Math.round(sharePct)}%</span></div>`;
      }).join("")}
    </div>
    <p class="figure-sub" style="margin-top:12px">${t("safe." + verdict)}</p>`;
}

/* ---------------- section 4: body meters ---------------- */

function vitalsSection(g) {
  const d = state.data;
  const hrDays = [];
  g.hr.forEach((v, i) => { if (v != null) hrDays.push({ i, v, max: d.days.hrMax[g.from + i], n: d.days.hrN[g.from + i] }); });
  const hrTotal = d.days.hrN.reduce((s, v) => s + (v || 0), 0);
  const dsV = g.ds;

  return `<div class="sec-body">
    <div class="card" id="hr">
      <div class="card-head">
        <h3 class="card-title">${t("vt.hr")}</h3>
        <span class="card-note">${hrDays.length ? t("vt.hrNote", { n: d.coverage.find((c) => c.key.includes("HeartRate"))?.n || 0, d: hrDays.length }) : ""}</span>
      </div>
      ${hrDays.length ? `<div class="figure"><b>${f1(g.hrAvg, 0)}</b><span>${t("unit.bpm")}</span></div>
      <p class="figure-sub">${t("vt.perSample")} · ${t("vt.maxDay")} ${Math.max(...hrDays.map((x) => x.max || 0))} ${t("unit.bpm")}</p>
      <div class="chart" data-c="hr"></div>` : `<p class="figure-sub">${t("tile.noData")}</p>`}
      <p class="figure-sub" style="margin-top:10px">${t("vt.hrSparse")}</p>
    </div>

    <div class="card" id="basal" data-span-from="${(trimToData(d.days.basal.slice(g.from, g.to + 1), g.from) || { from: g.from }).from}" data-span-to="${(trimToData(d.days.basal.slice(g.from, g.to + 1), g.from) || { to: g.to }).to}">
      <div class="card-head">
        <h3 class="card-title">${t("vt.basal")}</h3>
        <span class="card-note">${t("vt.basalNote")}</span>
      </div>
      <div class="figure"><b>${wan(g.basalTotal)}</b><span>${t("unit.kcal")}</span></div>
      <p class="figure-sub">${t("vt.perDay")} ${fInt(g.basalTotal / Math.max(1, g.basal.filter((v) => v != null).length))} ${t("unit.kcal")}</p>
      <div class="chart" data-c="basal"></div>
      <div class="axis"><span class="js-axis-from"></span><span class="js-axis-to"></span></div>
    </div>

    <div class="card" id="active">
      <div class="card-head">
        <h3 class="card-title">${t("vt.active")}</h3>
        <span class="card-note">${t("vt.activeNote")}</span>
      </div>
      <div class="figure"><b>${wan(g.activeTotal)}</b><span>${t("unit.kcal")}</span></div>
      <p class="figure-sub">${t("energy.ringsNote", { c: g.ringsClosed, d: g.ringsDays, g: g.rings[0] ? g.rings[0][2] : 160 })}</p>
      <div class="chart cal" data-c="activeHeat"></div>
      <div class="cal-legend"><span>${t("cal.less")}</span>
        ${[0.06, 0.22, 0.42, 0.64, 0.9].map((o) => `<i style="background:hsl(var(--tint) / ${o})"></i>`).join("")}
        <span>${t("cal.more")}</span></div>
    </div>

    <div class="card" id="ds" data-span-from="${(trimToData(d.days.ds.slice(g.from, g.to + 1), g.from) || { from: g.from }).from}" data-span-to="${(trimToData(d.days.ds.slice(g.from, g.to + 1), g.from) || { to: g.to }).to}">
      <div class="card-head">
        <h3 class="card-title">${t("vt.ds")}</h3>
        <span class="card-note">${t("vt.dsNote")}</span>
      </div>
      <div class="figure"><b>${f1((dsV || 0) * 100, 1)}</b><span>%</span></div>
      <p class="figure-sub">${t("gait.ds")} · ${t("st.avg")}</p>
      <div class="chart" data-c="ds"></div>
      <div class="axis"><span class="js-axis-from"></span><span class="js-axis-to"></span></div>
    </div>
  </div>`;
}

/* ---------------- charts ---------------- */

function specs(section, ctx) {
  const d = state.data;
  const range = { from: ctx.from, to: ctx.to };

  if (section === "steps") {
    return {
      st12: (w) => {
        const months = [];
        const endIdx = d.days.count - 1;
        const end = dayDate(endIdx);
        for (let k = 11; k >= 0; k--) {
          const dt = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - k, 1));
          const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - k + 1, 1));
          const a = Math.round((dt.getTime() - startMs()) / DAY);
          const b = Math.round((next.getTime() - startMs()) / DAY);
          let s = 0;
          for (let i = Math.max(0, a); i < Math.min(b, d.days.count); i++) s += d.days.steps[i] || 0;
          months.push({ label: monthLabel(dt.getUTCMonth()), v: s });
        }
        return Ch.areaLine({
          w, h: 190,
          values: months.map((m) => m.v),
          labels: months.map((m) => m.label),
          aria: "steps, last 12 months",
        });
      },
      dist: (w) => areaOf(w, ctx.dist, 120),
      steplen: (w) => areaOf(w, (trimToData(d.days.steplen.slice(range.from, range.to + 1), range.from) || {}).values || [], 100),
      speed: (w) => areaOf(w, (trimToData(d.days.speed.slice(range.from, range.to + 1), range.from) || {}).values || [], 100),
      flights: (w) => areaOf(w, ctx.flights, 100),
    };
  }

  if (section === "audio") {
    return {
      hero: (w) => {
        const { values, size } = bucketSeries(ctx.listenByDay, ctx.dayCount);
        const scaled = values.map((v) => (size === 30 ? v * 30 : size === 7 ? v * 7 : v) / 60);
        return Ch.areaLine({ w, h: 170, values: scaled, aria: "listening over time" });
      },
      cal: (w) => {
        const weeks = Math.min(53, Math.ceil(ctx.dayCount / 7));
        return Ch.calendar({
          w, values: ctx.listenByDay, endIdx: ctx.dayCount - 1, weeks,
          monthOf: (idx) => fmtMonth(ctx.from + idx),
          tip: (idx, v) => `${fmtDay(ctx.from + idx)} · ${shortDur(v)}`,
        }).svg;
      },
      clock: (w) => Ch.sunburst({ size: Math.max(140, Math.min(240, w - 4)), hours: ctx.hours }),
    };
  }

  if (section === "vitals") {
    const dayLabels = [];
    return {
      hr: (w) => {
        const rows = [];
        ctx.hr.forEach((v, i) => {
          if (v != null) rows.push({ label: `${dayDate(ctx.from + i).getUTCMonth() + 1}/${dayDate(ctx.from + i).getUTCDate()}`, v });
        });
        dayLabels.push(...rows.map((r) => r.label));
        return Ch.bars({ w, h: 170, values: rows.map((r) => r.v), labels: dayLabels, aria: "heart rate by day" });
      },
      basal: (w) => {
        const tr = trimToData(d.days.basal.slice(ctx.from, ctx.to + 1), ctx.from);
        return areaOf(w, tr ? tr.values : [], 140);
      },
      activeHeat: (w) => {
        const weeks = Math.min(53, Math.ceil(ctx.dayCount / 7));
        return Ch.calendar({
          w, values: ctx.active.map((v) => v || 0), endIdx: ctx.dayCount - 1, weeks,
          monthOf: (idx) => fmtMonth(ctx.from + idx),
          tip: (idx, v) => `${fmtDay(ctx.from + idx)} · ${fInt(v)} ${t("unit.kcal")}`,
        }).svg;
      },
      ds: (w) => {
        const tr = trimToData(d.days.ds.slice(ctx.from, ctx.to + 1), ctx.from);
        return areaOf(w, tr ? tr.values.map((v) => v * 100) : [], 110, true);
      },
    };
  }
  return {};
}

function areaOf(w, values, h, pctScale) {
  const clean = values.filter((x) => x != null && x > 0);
  const { values: v } = bucketSeries(values, values.length);
  const arr = v.map((x) => (x == null ? 0 : x));
  let floor = 0;
  if (clean.length > 2) {
    const lo = Math.min(...clean), hi = Math.max(...clean);
    const pad = (hi - lo) * 0.25;
    floor = Math.max(0, lo - (pad || hi * 0.05));
  }
  return Ch.areaLine({ w, h, values: arr, floor, aria: pctScale ? "double support" : "series" });
}

const MON_SHORT = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const monthLabel = (m) => (state.lang === "en" ? MON[m] : m + 1 + "月");

let currentSpecs = {};

function paintCharts() {
  if (!state.data || !lastCtx) return;
  for (const node of $$("[data-c]")) {
    const key = node.dataset.c;
    const fn = currentSpecs[key];
    if (!fn) continue;
    const w = node.clientWidth || node.parentElement.clientWidth;
    if (w < 40) continue;
    node.innerHTML = fn(w);
    if (key === "hero") attachHeroBrush(node, lastCtx);
  }
  for (const node of $$(".axis")) {
    const host = node.closest("[data-span-from]");
    const a = node.querySelector(".js-axis-from");
    const b = node.querySelector(".js-axis-to");
    if (!a || !b) continue;
    a.textContent = fmtDay(host ? +host.dataset.spanFrom : lastCtx.from);
    b.textContent = fmtDay(host ? +host.dataset.spanTo : lastCtx.to);
  }
}

function attachHeroBrush(node, ctx) {
  const svg = node.querySelector("svg");
  if (!svg || node.dataset.brush === "1") return;
  node.dataset.brush = "1";
  node.style.touchAction = "pan-y";
  let startX = null;
  let band = null;
  const frac = (clientX) => {
    const r = svg.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  node.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = frac(e.clientX);
    const r = svg.getBoundingClientRect();
    band = document.createElement("div");
    band.style.cssText = "position:absolute;top:0;bottom:0;background:rgba(255,255,255,.14);border-left:1px solid rgba(255,255,255,.42);border-right:1px solid rgba(255,255,255,.42);pointer-events:none;";
    band.style.left = startX * r.width + "px";
    band.style.width = "0px";
    node.style.position = "relative";
    node.appendChild(band);
    node.setPointerCapture(e.pointerId);
  });
  node.addEventListener("pointermove", (e) => {
    if (startX === null || !band) return;
    const r = svg.getBoundingClientRect();
    const x = frac(e.clientX);
    const a = Math.min(startX, x), b = Math.max(startX, x);
    band.style.left = a * r.width + "px";
    band.style.width = (b - a) * r.width + "px";
  });
  const end = (e) => {
    if (startX === null) return;
    const x = frac(e.clientX);
    const a = Math.min(startX, x), b = Math.max(startX, x);
    startX = null;
    if (band) { band.remove(); band = null; }
    if (b - a < 0.04) return;
    const from = ctx.from + Math.round(a * (ctx.dayCount - 1));
    const to = ctx.from + Math.round(b * (ctx.dayCount - 1));
    if (to - from < 2) return;
    state.from = from;
    state.to = to;
    state.preset = "custom";
    render();
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", () => { startX = null; if (band) { band.remove(); band = null; } });
}

/* ---------------- render ---------------- */

function render() {
  if (!state.data) return;
  const range = currentRange();
  const gctx = compute(range);
  const aw = audioWindow(range);
  const actx = aw ? compute(aw) : null;
  const section = state.section === "audio" && !actx ? "summary" : state.section;
  const ctx = section === "audio" ? actx : gctx;
  lastCtx = section === "audio" ? actx : gctx;
  fullCtx = section === "summary" ? compute({ from: 0, to: state.data.days.count - 1 }) : fullCtx;

  currentSpecs = specs(section, ctx);

  let body = "";
  if (section === "summary") body = summarySection(gctx);
  else if (section === "steps") body = stepsSection(gctx);
  else if (section === "audio") body = audioSection(actx);
  else body = vitalsSection(gctx);

  $("#dashBody").innerHTML = `${filterBar(range)}${sectionNav()}${secHead(section)}${body}`;

  requestAnimationFrame(() => {
    const seg = $("#seg");
    if (seg) {
      const on = seg.querySelector("button.on");
      const thumb = $("#segThumb");
      if (on && thumb) {
        thumb.style.left = on.offsetLeft + "px";
        thumb.style.width = on.offsetWidth + "px";
      }
    }
    paintCharts();
  });
}

/* ---------------- parsing ---------------- */

const SAMPLE_URL = window.__SAMPLE_URL__ || "data/prepared.json";
const STAGES = ["read", "unzip", "scan", "finish"];

const busy = { pct: 0, stage: "read", started: 0, timer: 0, worker: null };

function fmtBytes(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
  if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function busyStart() {
  busy.pct = 0;
  busy.stage = "read";
  busy.started = Date.now();
  clearInterval(busy.timer);
  busy.timer = setInterval(() => {
    const el = $("#busyElapsed");
    if (el) el.textContent = ((Date.now() - busy.started) / 1000).toFixed(1) + "s";
  }, 200);
  busyUpdate({ stage: "read", pct: 0 });
}

function busyStop() {
  clearInterval(busy.timer);
  busy.timer = 0;
}

function busyUpdate(p) {
  busy.pct = Math.max(busy.pct, Math.min(100, p.pct || 0));
  busy.stage = p.stage || busy.stage;

  const ring = $("#ringFill");
  const C = 326.7;
  if (ring) ring.setAttribute("stroke-dashoffset", String(C - (C * busy.pct) / 100));
  const pctEl = $("#pct");
  if (pctEl) pctEl.textContent = Math.round(busy.pct) + "%";

  const bar = $("#busyBar");
  if (bar) bar.style.width = busy.pct + "%";
  const wrap = $("#busyBarWrap");
  if (wrap) wrap.setAttribute("aria-valuenow", String(Math.round(busy.pct)));

  const idx = STAGES.indexOf(busy.stage);
  for (const el of $$("#busySteps span")) {
    const i = STAGES.indexOf(el.dataset.stage);
    el.classList.toggle("done", i > -1 && i < idx);
    el.classList.toggle("on", i === idx);
  }

  const title = $("#busyTitle");
  if (title) title.textContent = t("busy." + (["read", "unzip", "scan", "finish"].includes(busy.stage) ? busy.stage : "title"));

  const bits = [];
  if (p.total) bits.push(fmtBytes(p.bytes || 0) + " / " + fmtBytes(p.total));
  if (p.records) bits.push(fInt(p.records) + " " + (state.lang === "en" ? "records" : "条"));
  if (p.lines && busy.stage === "scan") bits.push(fInt(p.lines) + " " + (state.lang === "en" ? "lines" : "行"));
  const text = $("#busyText");
  if (text) text.textContent = bits.length ? bits.join(" · ") : t("busy.working");
}

function parseProgress(p) {
  if (state.cancel) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
  busyUpdate(p);
}

async function parseFile(file) {
  const isXml = /\.xml$/i.test(file.name);
  const canWorker =
    typeof Worker !== "undefined" &&
    !window.__NO_WORKER__ &&
    location.protocol !== "file:" &&
    (isXml || supportsDeflateRaw);

  if (canWorker) {
    try {
      document.documentElement.dataset.parser = "worker";
      return await parseInWorker(file);
    } catch (err) {
      if (err && err.fatal) throw err;
      // worker could not start (CSP, old browser) — fall back to the main thread
    }
  }
  document.documentElement.dataset.parser = "main";
  try {
    return await scanFile(file, parseProgress);
  } catch (err) {
    if (err && err.code) throw err;
    const e = new Error((err && err.message) || "unknown");
    e.code = "parse_failed";
    throw e;
  }
}

function parseInWorker(file) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./lib/scan-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err);
      return;
    }
    busy.worker = worker;
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      busy.worker = null;
      busy.abort = null;
      fn(arg);
    };
    busy.abort = () => finish(reject, Object.assign(new Error("cancelled"), { code: "cancelled" }));
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "progress") busyUpdate(m.p);
      else if (m.type === "done") finish(resolve, m.data);
      else if (m.type === "error") {
        const err = new Error((m.code || "read_failed") + (m.message ? ": " + m.message : ""));
        err.code = m.code || "read_failed";
        err.fatal = true;
        finish(reject, err);
      }
    };
    worker.onerror = (e) => {
      const err = new Error((e && e.message) || "worker_crashed");
      err.code = "worker_crashed";
      if (!e || !e.message) err.fatal = false;
      finish(reject, err);
      if (e && e.preventDefault) e.preventDefault();
    };
    worker.postMessage({ type: "start", file });
  });
}

async function handleFile(file) {
  $("#introErr").hidden = true;
  state.cancel = false;
  state.demo = false;
  show("busy");
  busyStart();

  try {
    if (!supportsDeflateRaw && !/\.xml$/i.test(file.name)) throw fail("no_inflate");
    if (file.size > 2.5 * 1024 ** 3) throw fail("too_large");
    const data = await parseFile(file);
    busyUpdate({ stage: "done", pct: 100 });
    data.meta.zipSize = file.size;
    data.meta.sourceName = file.name;
    setData(data);
  } catch (err) {
    busyStop();
    const code = (err && err.code) || (err && err.message === "cancelled" ? "cancelled" : "parse_failed");
    show("intro");
    if (code === "cancelled") return;
    const box = $("#introErr");
    const known = t("err." + code) !== "err." + code;
    const main = known ? t("err." + code) : t("err.read_failed");
    const detail = [code, (err && err.message) || ""].filter(Boolean).join(" · ");
    box.innerHTML = `<b>${esc(main)}</b><span class="err-detail" title="${esc(navigator.userAgent)}">${esc(detail)}</span>`;
    box.hidden = false;
  } finally {
    busyStop();
  }
}

async function loadSample() {
  if (window.__PREPARED__) return window.__PREPARED__;
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error("read_failed");
  return res.json();
}

function labelSample() {
  const btn = $("#sample");
  if (!btn) return;
  const demo = window.__DEMO__ === true;
  btn.textContent = demo
    ? (state.lang === "en" ? "See a demo dataset" : "看一份演示数据")
    : t("intro.sample");
}

/* ---------------- events ---------------- */

function wire() {
  const grid = $("#skinGrid");
  grid.innerHTML = Skins.SKINS.map((s) => `<button class="skin" data-skin="${s.id}" title="${state.lang === "en" ? s.en : s.name}" style="background:${Skins.swatch(s)}"></button>`).join("");
  const active = Skins.current();
  Skins.paint(active);
  for (const b of $$(".skin")) b.classList.toggle("on", b.dataset.skin === active.id);

  $("#skinBtn").addEventListener("click", () => { $("#skinPop").hidden = !$("#skinPop").hidden; });
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-skin]");
    if (!b) return;
    const s = Skins.SKINS.find((x) => x.id === b.dataset.skin);
    Skins.paint(s);
    Skins.save(s.id);
    for (const x of $$(".skin")) x.classList.toggle("on", x === b);
    $("#skinPop").hidden = true;
    if (state.data) render();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#skinPop") && !e.target.closest("#skinBtn")) $("#skinPop").hidden = true;
  });

  const langBtn = $("#langBtn");
  langBtn.textContent = state.lang === "zh" ? "EN" : "中";
  langBtn.addEventListener("click", () => {
    state.lang = state.lang === "zh" ? "en" : "zh";
    I18n.lang = state.lang;
    langBtn.textContent = state.lang === "zh" ? "EN" : "中";
    I18n.apply();
    labelSample();
    if (state.data) render();
  });

  const file = $("#file");
  $("#pick").addEventListener("click", (e) => { e.stopPropagation(); file.click(); });
  file.addEventListener("change", () => { if (file.files[0]) handleFile(file.files[0]); });
  $("#drop").addEventListener("click", () => file.click());
  $("#drop").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") file.click(); });
  $("#sample").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const d = await loadSample();
      state.demo = window.__DEMO__ === true;
      setData(d);
    } catch (err) {
      const box = $("#introErr");
      box.textContent = state.lang === "en"
        ? "The demo dataset could not be loaded here (blocked on file://). Upload your own export instead."
        : "这个环境下读不到演示数据（file:// 会拦截请求），直接上传你自己的导出包即可。";
      box.hidden = false;
    }
  });

  for (const type of ["dragenter", "dragover"]) {
    $("#drop").addEventListener(type, (e) => { e.preventDefault(); $("#drop").classList.add("over"); });
  }
  for (const type of ["dragleave", "drop"]) {
    $("#drop").addEventListener(type, (e) => { e.preventDefault(); $("#drop").classList.remove("over"); });
  }
  $("#drop").addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  $("#cancel").addEventListener("click", () => {
    state.cancel = true;
    if (busy.abort) busy.abort();
    if (busy.worker) { busy.worker.terminate(); busy.worker = null; }
    busyStop();
    show("intro");
  });
  $("#restart").addEventListener("click", () => { state.data = null; show("intro"); });

  $("#dashBody").addEventListener("click", (e) => {
    const sec = e.target.closest("[data-section]");
    if (sec && !sec.disabled) {
      state.section = sec.dataset.section;
      render();
      return;
    }
    const p = e.target.closest("[data-preset]");
    if (p) {
      state.preset = p.dataset.preset;
      if (state.preset !== "custom") {
        const r = currentRange();
        state.from = r.from;
        state.to = r.to;
      }
      render();
      return;
    }
    const dev = e.target.closest("[data-dev]");
    if (dev) {
      state.dev = dev.dataset.dev === "all" ? "all" : Number(dev.dataset.dev);
      render();
      return;
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "fromDate" || e.target.id === "toDate") {
      const idx = dayIdxFromIso(e.target.value);
      if (idx === null) return;
      if (e.target.id === "fromDate") state.from = idx; else state.to = idx;
      state.preset = "custom";
      render();
    }
  });

  document.addEventListener("mouseover", (e) => {
    const r = e.target.closest(".cal rect");
    if (!r) return;
    const tip = $("#calTip");
    if (tip && r.querySelector("title")) tip.textContent = r.querySelector("title").textContent;
  });

  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.data) paintCharts(); }, 160);
  });
}

/* ---------------- boot ---------------- */


if (new URLSearchParams(location.search).get("lang") === "en") state.lang = "en";
I18n.lang = state.lang;
I18n.apply();
wire();
labelSample();
if (!supportsDeflateRaw) {
  const box = $("#introErr");
  box.textContent = t("err.no_inflate");
  box.hidden = false;
}

if (/[?&](sample=1|at=\d+)/.test(location.search) || window.__AUTO__) {
  loadSample()
    .then((d) => {
      state.demo = window.__DEMO__ === true;
      setData(d);
      const q = new URLSearchParams(location.search);
      const sec = q.get("sec");
      const pre = q.get("preset");
      if (sec && ["summary", "steps", "audio", "vitals"].includes(sec)) state.section = sec;
      if (pre && ["all", "1y", "90", "30", "7"].includes(pre)) {
        state.preset = pre;
        const r = currentRange();
        state.from = r.from;
        state.to = r.to;
      }
      if (sec || pre) render();
      const y = +(q.get("at") || 0);
      if (y) setTimeout(() => window.scrollTo(0, y), 60);
    })
    .catch(() => {});
}
