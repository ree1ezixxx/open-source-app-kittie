import type { AppIdea } from "./api/ideas";

/**
 * Per-idea app mockup — a complete, self-contained HTML document rendered in an
 * <iframe srcdoc> (parity with appkittie's live iframe mockups). Deterministic,
 * quota-free: the screen ARCHETYPE is chosen from the idea's category and the
 * content/theme is filled from its own blueprint, so every idea gets a distinct,
 * fully-styled, app-like preview — not one generic frame recoloured.
 *
 * Pure CSS + emoji (no scripts) so it renders safely under sandbox="".
 */

type Archetype = "feed" | "dashboard" | "chat" | "commerce" | "media" | "list";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function initials(s: string): string {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "A") + (w[1]?.[0] ?? "")).toUpperCase();
}

function archetypeOf(idea: AppIdea): Archetype {
  const c = `${idea.ideaCategory} ${idea.sourceCategory} ${idea.title}`.toLowerCase();
  if (/chat|messag|dating|social|assistant|companion|friend|connect/.test(c)) return "chat";
  if (/music|video|stream|media|movie|podcast|audio|player|entertain|photo|art|design|generat|camera/.test(c))
    return "media";
  if (/shop|store|market|commerce|food|deliver|travel|book|ticket|retail|fashion|order|menu/.test(c))
    return "commerce";
  if (/finance|bank|budget|invest|crypto|wallet|health|fitness|track|habit|workout|sleep|medita|productiv|task|goal|calorie|money/.test(c))
    return "dashboard";
  if (/news|feed|content|community|blog|story|discover|reels|post|forum/.test(c)) return "feed";
  return "list";
}

function feats(idea: AppIdea, n: number): string[] {
  const d = idea.blueprintDoc;
  const all = [...(d?.mvpFeatures ?? []), ...(d?.keyFeatures ?? [])].map((x) => String(x).trim()).filter(Boolean);
  const seen = new Set<string>();
  const uniq = all.filter((f) => (seen.has(f.toLowerCase()) ? false : (seen.add(f.toLowerCase()), true)));
  const fallback = [idea.ideaCategory, idea.sourceCategory, "Get started", "Settings", "Profile"].filter(Boolean);
  return [...uniq, ...fallback].slice(0, n);
}

/** A small deterministic integer in [lo, hi] from a seed + salt. */
function pseudo(seed: number, salt: number, lo: number, hi: number): number {
  // /2^32 keeps v in [0,1) so floor never reaches hi+1 (a '3:60' / >100% glitch).
  const v = (Math.imul(seed ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 0) / 0x100000000;
  return lo + Math.floor(v * (hi - lo + 1));
}

/* ---------- archetype bodies (return inner <main> html + tab set) ---------- */

interface Screen {
  body: string;
  tabs: { icon: string; label: string }[];
}

function dashboardScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 4);
  const big = pseudo(seed, 1, 12, 92);
  const pct = pseudo(seed, 2, 4, 38);
  const cap = esc(f[0] ?? "Today");
  const bars = Array.from({ length: 7 }, (_, i) => `<i style="height:${pseudo(seed, 10 + i, 26, 100)}%"></i>`).join("");
  const rows = f
    .slice(1)
    .map(
      (x, i) =>
        `<div class="row"><span class="rdot"></span><span class="rt">${esc(x)}</span><span class="rv">${pseudo(
          seed,
          20 + i,
          18,
          96,
        )}%</span></div>`,
    )
    .join("");
  return {
    body: `<section class="hero">
      <div class="herotop"><span class="cap">${cap}</span><span class="up">▲ ${pct}%</span></div>
      <div class="big">${big.toLocaleString()}<small>this week</small></div>
      <div class="spark">${bars}</div>
    </section>
    <div class="rows">${rows}</div>`,
    tabs: [
      { icon: "📊", label: "Overview" },
      { icon: "✨", label: "Insights" },
      { icon: "🎯", label: "Goals" },
      { icon: "👤", label: "You" },
    ],
  };
}

function feedScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 3);
  const stories = Array.from({ length: 6 }, (_, i) => `<span class="st" style="--i:${i}"></span>`).join("");
  const posts = f
    .map(
      (x, i) =>
        `<article class="post">
        <div class="ph"><span class="av">${esc(initials(idea.title + i))}</span><div class="pn"><b>${esc(
          idea.title.split(/\s+/)[0] || "App",
        )} ${["Daily", "Labs", "HQ"][i % 3]}</b><small>${pseudo(seed, i, 1, 9)}h ago</small></div></div>
        <p class="pt">${esc(x)}</p>
        <div class="pimg"></div>
        <div class="pacts"><span>♥ ${pseudo(seed, 30 + i, 1, 9)}.${pseudo(seed, 40 + i, 0, 9)}k</span><span>💬 ${pseudo(
          seed,
          50 + i,
          12,
          240,
        )}</span><span>↗</span></div>
      </article>`,
    )
    .join("");
  return {
    body: `<div class="stories">${stories}</div>${posts}`,
    tabs: [
      { icon: "🏠", label: "Home" },
      { icon: "🔍", label: "Explore" },
      { icon: "➕", label: "Create" },
      { icon: "🔔", label: "Activity" },
      { icon: "👤", label: "Profile" },
    ],
  };
}

function chatScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 4);
  const bubbles = f
    .map((x, i) => `<div class="b ${i % 2 ? "out" : "in"}">${esc(x)}</div>`)
    .join("");
  return {
    body: `<div class="chat">
      <div class="day">Today</div>
      ${bubbles}
      <div class="b in typing"><span></span><span></span><span></span></div>
    </div>
    <div class="composer"><span class="cph">Message…</span><b class="send">➤</b></div>`,
    tabs: [
      { icon: "💬", label: "Chats" },
      { icon: "✨", label: "Discover" },
      { icon: "📞", label: "Calls" },
      { icon: "👤", label: "You" },
    ],
  };
}

function commerceScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 4);
  const items = f
    .map(
      (x, i) =>
        `<div class="prod"><div class="pim" style="--h:${pseudo(seed, i, 0, 360)}"></div><b>${esc(
          x,
        )}</b><span class="pr">$${pseudo(seed, 10 + i, 4, 89)}.${pseudo(seed, 20 + i, 0, 9)}9</span></div>`,
    )
    .join("");
  return {
    body: `<div class="search">🔍 <span>Search ${esc(idea.ideaCategory)}</span></div>
      <div class="chips"><span class="chip on">All</span><span class="chip">New</span><span class="chip">Top</span><span class="chip">Deals</span></div>
      <div class="pgrid">${items}</div>`,
    tabs: [
      { icon: "🛍️", label: "Shop" },
      { icon: "🔍", label: "Search" },
      { icon: "❤️", label: "Saved" },
      { icon: "🛒", label: "Cart" },
    ],
  };
}

function mediaScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 4);
  const np = esc(f[0] ?? idea.title);
  const tracks = f
    .slice(1)
    .map(
      (x, i) =>
        `<div class="tr"><span class="tn">${i + 1}</span><div class="ti"><b>${esc(x)}</b><small>${esc(
          idea.title.split(/\s+/)[0] ?? "Studio",
        )}</small></div><span class="td">${pseudo(seed, i, 2, 5)}:${String(pseudo(seed, 10 + i, 0, 59)).padStart(
          2,
          "0",
        )}</span></div>`,
    )
    .join("");
  return {
    body: `<section class="np">
      <div class="art"></div>
      <b class="npt">${np}</b><small class="nps">${esc(idea.ideaCategory)}</small>
      <div class="pbar"><i style="width:${pseudo(seed, 5, 22, 74)}%"></i></div>
      <div class="ctrls"><span>⏮</span><span class="play">▶</span><span>⏭</span></div>
    </section>
    <div class="tracks">${tracks}</div>`,
    tabs: [
      { icon: "▶️", label: "Listen" },
      { icon: "🔍", label: "Browse" },
      { icon: "📚", label: "Library" },
      { icon: "👤", label: "You" },
    ],
  };
}

function listScreen(idea: AppIdea, seed: number): Screen {
  const f = feats(idea, 5);
  const rows = f
    .map(
      (x, i) =>
        `<div class="lr"><span class="lic">${["📌", "⚡", "✅", "🔖", "⭐"][i % 5]}</span><div class="lt"><b>${esc(
          x,
        )}</b><small>${esc(idea.sourceCategory)}</small></div><span class="chev">›</span></div>`,
    )
    .join("");
  return {
    body: `<div class="banner"><b>${esc(idea.blueprintDoc?.opportunity?.targetAudience ?? "Built for you")}</b><span>${esc(
      idea.ideaCategory,
    )}</span></div>
    <div class="list">${rows}</div>
    <div class="fab">＋</div>`,
    tabs: [
      { icon: "🏠", label: "Home" },
      { icon: "🗂️", label: "Library" },
      { icon: "🔍", label: "Search" },
      { icon: "⚙️", label: "Settings" },
    ],
  };
}

const SCREENS: Record<Archetype, (idea: AppIdea, seed: number) => Screen> = {
  dashboard: dashboardScreen,
  feed: feedScreen,
  chat: chatScreen,
  commerce: commerceScreen,
  media: mediaScreen,
  list: listScreen,
};

/** Build the full self-contained HTML document for an idea's mockup. */
export function buildMockupHtml(idea: AppIdea): string {
  const seed = hashStr(idea.id || idea.title);
  const hue = seed % 360;
  const arch = archetypeOf(idea);
  const { body, tabs } = SCREENS[arch](idea, seed);
  const sub = idea.blueprintDoc?.opportunity?.targetAudience ?? idea.ideaCategory;

  const tabbar = tabs
    .map((t, i) => `<div class="t${i === 0 ? " on" : ""}"><i>${t.icon}</i><span>${esc(t.label)}</span></div>`)
    .join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=390, initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
:root{--a:hsl(${hue} 82% 52%);--a2:hsl(${hue} 85% 64%);--soft:hsl(${hue} 70% 96%);--soft2:hsl(${hue} 55% 90%);--ink:#0b0c12;--mut:#717784;--line:#eef0f4;--bg:#fff;--card:#f7f8fa}
html,body{width:390px;height:844px;font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);overflow:hidden}
body{position:relative;display:flex;flex-direction:column}
.sb{height:48px;flex:none;display:flex;align-items:flex-end;justify-content:space-between;padding:0 24px 7px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.sb .net{display:inline-flex;gap:2px;align-items:flex-end;margin-right:7px}
.sb .net i{width:3px;border-radius:1px;background:var(--ink)}
.sb .net i:nth-child(1){height:5px}.sb .net i:nth-child(2){height:8px}.sb .net i:nth-child(3){height:11px}
.sb .bat{display:inline-block;width:22px;height:11px;border:1.5px solid var(--ink);border-radius:3px;position:relative}
.sb .bat::after{content:"";position:absolute;inset:1.5px;width:70%;background:var(--ink);border-radius:1px}
.hd{padding:6px 22px 12px;flex:none;display:flex;align-items:center;gap:12px}
.hd .ic{width:46px;height:46px;border-radius:13px;background:linear-gradient(140deg,var(--a),var(--a2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px;box-shadow:0 7px 18px hsl(${hue} 82% 52% / .34);flex:none}
.hd h1{font-size:20px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.hd p{font-size:11.5px;color:var(--mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px}
main{flex:1;padding:2px 20px 90px;display:flex;flex-direction:column;gap:13px;overflow:hidden}
/* dashboard */
.hero{background:linear-gradient(155deg,var(--a),var(--a2));border-radius:20px;padding:18px;color:#fff;box-shadow:0 12px 26px hsl(${hue} 82% 52% / .3)}
.herotop{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.94;font-weight:600}
.herotop .up{background:rgba(255,255,255,.22);padding:3px 9px;border-radius:20px;font-size:11px}
.big{font-size:46px;font-weight:850;letter-spacing:-.03em;margin:6px 0 14px;display:flex;align-items:baseline;gap:8px}
.big small{font-size:12px;font-weight:600;opacity:.85}
.spark{display:flex;align-items:flex-end;gap:6px;height:46px}
.spark i{flex:1;background:rgba(255,255,255,.55);border-radius:4px 4px 0 0}
.rows{display:flex;flex-direction:column;gap:9px}
.row{display:flex;align-items:center;gap:11px;background:var(--card);border-radius:14px;padding:14px 15px}
.row .rdot{width:10px;height:10px;border-radius:4px;background:var(--a);flex:none}
.row .rt{flex:1;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .rv{font-size:13px;font-weight:750;color:var(--a)}
/* feed */
.stories{display:flex;gap:13px;padding:2px 0 4px}
.stories .st{width:54px;height:54px;border-radius:50%;flex:none;background:var(--card);border:2.5px solid var(--a);background:linear-gradient(135deg,var(--soft),var(--soft2))}
.post{border:1px solid var(--line);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px}
.post .ph{display:flex;align-items:center;gap:10px}
.post .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none}
.post .pn b{font-size:13.5px;font-weight:700;display:block}
.post .pn small{font-size:11px;color:var(--mut)}
.post .pt{font-size:13.5px;line-height:1.45}
.post .pimg{height:150px;border-radius:14px;background:linear-gradient(135deg,var(--soft),var(--soft2))}
.post .pacts{display:flex;gap:18px;font-size:12.5px;color:var(--mut);font-weight:600}
/* chat */
.chat{display:flex;flex-direction:column;gap:9px;padding-top:4px}
.chat .day{align-self:center;font-size:11px;color:var(--mut);background:var(--card);padding:4px 12px;border-radius:20px;margin-bottom:2px}
.b{max-width:78%;font-size:13.5px;line-height:1.4;padding:11px 14px;border-radius:19px}
.b.in{align-self:flex-start;background:var(--card);border-bottom-left-radius:6px}
.b.out{align-self:flex-end;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff;border-bottom-right-radius:6px}
.b.typing{display:flex;gap:5px;align-items:center}
.b.typing span{width:7px;height:7px;border-radius:50%;background:var(--mut);opacity:.5}
.composer{position:absolute;bottom:84px;left:18px;right:18px;display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:11px 14px}
.composer .cph{flex:1;font-size:13.5px;color:var(--mut)}
.composer .send{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px}
/* commerce */
.search{display:flex;align-items:center;gap:8px;background:var(--card);border-radius:14px;padding:13px 15px;font-size:13.5px;color:var(--mut)}
.chips{display:flex;gap:8px}
.chips .chip{font-size:12px;font-weight:650;padding:7px 15px;border-radius:20px;background:var(--card);color:var(--mut)}
.chips .chip.on{background:var(--a);color:#fff}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.prod{display:flex;flex-direction:column;gap:7px}
.prod .pim{height:118px;border-radius:15px;background:linear-gradient(150deg,hsl(var(--h) 70% 88%),hsl(var(--h) 60% 78%))}
.prod b{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prod .pr{font-size:13px;font-weight:800;color:var(--a)}
/* media */
.np{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding:6px 0 2px}
.np .art{width:172px;height:172px;border-radius:22px;background:linear-gradient(145deg,var(--a),var(--a2));box-shadow:0 16px 34px hsl(${hue} 82% 52% / .34);margin-bottom:10px}
.np .npt{font-size:18px;font-weight:800;letter-spacing:-.02em}
.np .nps{font-size:12.5px;color:var(--mut)}
.np .pbar{width:100%;height:5px;border-radius:3px;background:var(--card);margin:12px 0 6px;overflow:hidden}
.np .pbar i{display:block;height:100%;background:var(--a);border-radius:3px}
.np .ctrls{display:flex;align-items:center;gap:30px;font-size:22px;color:var(--ink)}
.np .ctrls .play{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 8px 20px hsl(${hue} 82% 52% / .4)}
.tracks{display:flex;flex-direction:column;gap:2px;margin-top:6px}
.tr{display:flex;align-items:center;gap:13px;padding:10px 4px}
.tr .tn{font-size:13px;color:var(--mut);font-weight:700;width:16px;text-align:center}
.tr .ti{flex:1}.tr .ti b{font-size:13.5px;font-weight:650;display:block}.tr .ti small{font-size:11.5px;color:var(--mut)}
.tr .td{font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
/* list */
.banner{background:linear-gradient(140deg,var(--a),var(--a2));border-radius:18px;padding:18px;color:#fff;display:flex;flex-direction:column;gap:4px}
.banner b{font-size:16px;font-weight:800;letter-spacing:-.02em}
.banner span{font-size:12px;opacity:.9}
.list{display:flex;flex-direction:column;gap:9px}
.lr{display:flex;align-items:center;gap:13px;background:var(--card);border-radius:15px;padding:14px}
.lr .lic{font-size:19px}
.lr .lt{flex:1}.lr .lt b{font-size:13.5px;font-weight:650;display:block}.lr .lt small{font-size:11.5px;color:var(--mut)}
.lr .chev{color:var(--mut);font-size:20px}
.fab{position:absolute;right:22px;bottom:96px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--a2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 10px 24px hsl(${hue} 82% 52% / .42)}
/* tab bar */
.tabbar{position:absolute;bottom:0;left:0;right:0;height:80px;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);border-top:1px solid var(--line);display:flex;justify-content:space-around;padding-top:11px}
.tabbar .t{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:600;color:var(--mut)}
.tabbar .t.on{color:var(--a)}
.tabbar .t i{font-size:22px;font-style:normal}
</style></head><body>
<div class="sb"><span>9:41</span><span><span class="net"><i></i><i></i><i></i></span><span class="bat"></span></span></div>
<div class="hd"><div class="ic">${esc(initials(idea.title))}</div><div><h1>${esc(idea.title)}</h1><p>${esc(sub)}</p></div></div>
<main>${body}</main>
<nav class="tabbar">${tabbar}</nav>
</body></html>`;
}
