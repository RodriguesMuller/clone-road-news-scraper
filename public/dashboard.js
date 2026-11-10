/*
 * Road News — Dashboard executivo, cabeçalho superior e tema claro/escuro.
 *
 * Usa só dados que o painel já carrega (state.items / recentItems / mapItems via
 * uniqueMapItems()) e a régua única de risco (public/risk.js) + motor de resumo
 * (public/brief.js). Nada aqui inventa número: quando falta base de comparação ou dado,
 * o cartão diz isso. Vanilla JS, sem dependências (gráficos em SVG, mapa no Leaflet que o
 * painel já usa).
 *
 * Depende de funções globais do script principal (index.html): state, escapeHtml, safeUrl,
 * uniqueMapItems, buildMapPoint, mapPopup, addBaseTiles, smartSummary, roadFromText,
 * canUseFeature, getDisplayName, roleLabel, applyRoute, syncClientFilters, BRASILIA_TIME_ZONE.
 */
(function () {
  "use strict";

  const THEME_KEY = "roadnews.theme";
  const DAY = 24 * 3600e3;
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Ícones no traço Lucide (24x24, stroke).
  const ICONS = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    octagon: '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  // Paleta Overhaul: gravidade em Deep Orange / Burnt Yellow / Sky Blue / Vivid Green.
  const LEVEL = {
    critical: { label: "Crítico", cls: "sev-critical", color: "#FC3700" },
    high: { label: "Alto", cls: "sev-high", color: "#FFCD00" },
    medium: { label: "Médio", cls: "sev-medium", color: "#00ACFF" },
    low: { label: "Baixo", cls: "sev-low", color: "#1EFF95" },
  };

  // Temas (rosca e selos) a partir do tipo de ocorrência da régua — cores da paleta secundária.
  const THEMES = [
    ["Acidentes", "#7758FF", (k) => ["accident", "accident_partial", "accident_jam", "fatal_accident", "heavy_vehicle", "hazmat", "small_fire", "fire"].includes(k)],
    ["Interdições", "#FC3700", (k) => ["block_total", "block_partial", "block_partial_planned", "block_planned", "strike_block"].includes(k)],
    ["Obras", "#FFCD00", (k, t) => k === "traffic" && /obra|manutenc|recapeam|pare.e.siga|pavimenta/.test(t)],
    ["Trânsito", "#00ACFF", (k) => ["traffic", "jam"].includes(k)],
    ["Clima", "#C6BDFC", (k) => ["weather", "visibility", "inmet", "inmet_red", "inmet_orange", "inmet_yellow"].includes(k)],
    ["Roubo de carga", "#F78D87", (k) => ["cargo_theft", "cargo_theft_police"].includes(k)],
    ["Greves", "#E4C1F9", (k) => k === "strike"],
    ["Infraestrutura", "#487E72", (k) => k === "structural"],
    ["Combustíveis e pedágios", "#1EFF95", (k, t) => /diesel|combustive|pedagio/.test(t)],
  ];
  function themeOf(kind, text) {
    const found = THEMES.find(([, , test]) => test(kind, text));
    return found ? found[0] : "Outros";
  }
  const THEME_COLOR = Object.fromEntries([...THEMES.map(([n, c]) => [n, c]), ["Outros", "#9FA3A1"]]);

  const dash = { days: 7, filter: "all", featuredIndex: 0, featuredTimer: null, map: null, layer: null, lastCounts: {} };

  // ---------------- dados ----------------
  function itemTime(item) {
    for (const value of [item.created_at, item.published_at, item.scraped_at]) {
      const t = Date.parse(value || "");
      if (Number.isFinite(t)) return t;
    }
    return null;
  }

  function enrich(item) {
    const risk = window.RoadRisk.classifyRisk(item);
    const text = window.RoadRisk.normalize(`${item.title || ""} ${item.summary || ""}`);
    const inmet = item.type === "INMET" || /inmet/i.test(item.source || "");
    return {
      item,
      time: itemTime(item),
      risk,
      inmet,
      theme: themeOf(risk.kind, text),
      road: inmet ? "" : (typeof roadFromText === "function" ? roadFromText(`${item.title || ""} ${item.summary || ""} ${item.highway || ""}`) : ""),
      source: String(item.source || "").trim(),
    };
  }

  function dataset() {
    const now = Date.now();
    const windowMs = dash.days * DAY;
    const all = (typeof uniqueMapItems === "function" ? uniqueMapItems() : []).map(enrich);
    const times = all.map((e) => e.time).filter((t) => t !== null);
    const earliest = times.length ? Math.min(...times) : null;
    const inRange = (e, from, to) => e.time !== null && e.time >= from && e.time < to;
    return {
      now,
      windowMs,
      all,
      current: all.filter((e) => inRange(e, now - windowMs, now + 60e3)),
      previous: all.filter((e) => inRange(e, now - 2 * windowMs, now - windowMs)),
      comparable: earliest !== null && earliest <= now - 2 * windowMs,
      earliest,
    };
  }

  const METRICS = [
    { key: "collected", label: "Notícias coletadas", icon: "file", tone: "blue", help: "Notícias e avisos coletados das fontes monitoradas no período.", count: (list) => list.length },
    { key: "impact", label: "Com impacto na frota", icon: "target", tone: "cyan", help: "Notícias classificadas como Médio, Alto ou Crítico pela régua de risco (afetam rota, horário ou carga).", count: (list) => list.filter((e) => e.risk.rank >= 2).length },
    { key: "important", label: "Alertas importantes", icon: "alert", tone: "orange", help: "Notícias de risco Alto ou Crítico.", count: (list) => list.filter((e) => e.risk.rank >= 3).length },
    { key: "critical", label: "Notícias críticas", icon: "octagon", tone: "red", help: "Risco Crítico: via indisponível agora ou carga sob ameaça imediata.", count: (list) => list.filter((e) => e.risk.rank === 4).length },
    { key: "roads", label: "Rodovias afetadas", icon: "truck", tone: "violet", help: "Rodovias distintas citadas em notícias com impacto (Médio ou acima).", count: (list) => new Set(list.filter((e) => e.road && e.risk.rank >= 2).map((e) => e.road)).size },
    { key: "sources", label: "Fontes ativas", icon: "radio", tone: "green", help: "Fontes que publicaram ao menos uma notícia coletada no período.", count: (list) => new Set(list.map((e) => e.source).filter(Boolean)).size },
  ];

  function buckets(data) {
    const size = dash.days === 1 ? 2 * 3600e3 : dash.days === 7 ? DAY : 2 * DAY;
    const n = Math.round(data.windowMs / size);
    const start = data.now - data.windowMs;
    const out = Array.from({ length: n }, (_, i) => ({ start: start + i * size, items: [], prev: [] }));
    for (const e of data.current) out[Math.min(n - 1, Math.max(0, Math.floor((e.time - start) / size)))].items.push(e);
    for (const e of data.previous) out[Math.min(n - 1, Math.max(0, Math.floor((e.time - (start - data.windowMs)) / size)))].prev.push(e);
    return { list: out, size };
  }

  // ---------------- utilitários de UI ----------------
  const esc = (v) => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? ""));
  const urlOf = (u) => (typeof safeUrl === "function" ? safeUrl(u) : "");
  const tz = () => (typeof BRASILIA_TIME_ZONE === "string" ? BRASILIA_TIME_ZONE : "America/Sao_Paulo");

  function relative(t) {
    if (!t) return "";
    const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (minutes < 60) return `há ${Math.max(1, minutes)} min`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `há ${hours}h` : `há ${Math.round(hours / 24)} dias`;
  }

  function dateLabel(t, withHour = true) {
    if (!t) return "";
    return new Date(t).toLocaleString("pt-BR", { timeZone: tz(), day: "2-digit", month: "2-digit", ...(withHour ? { hour: "2-digit", minute: "2-digit" } : {}) });
  }

  function shorten(text, limit) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length <= limit ? value : `${value.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
  }

  function animateNumber(el, to) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (reduceMotion() || from === to) { el.textContent = to.toLocaleString("pt-BR"); return; }
    const start = performance.now();
    const duration = 700;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased).toLocaleString("pt-BR");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function sparkline(values, tone) {
    const w = 120, h = 36;
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const id = `sp-${tone}-${Math.random().toString(36).slice(2, 7)}`;
    return `<svg class="sparkline tone-${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function delta(cur, prev, comparable) {
    if (!comparable) return `<span class="kpi-delta muted" title="Os dados carregados não cobrem o período anterior inteiro.">sem base de comparação</span>`;
    if (!prev) return cur ? `<span class="kpi-delta up">novo no período</span>` : `<span class="kpi-delta muted">= período anterior</span>`;
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (!pct) return `<span class="kpi-delta muted">= período anterior</span>`;
    return `<span class="kpi-delta ${pct > 0 ? "up" : "down"}">${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% <small>vs período anterior</small></span>`;
  }

  // Ilustração de reserva por tema, usada quando a fonte não publica imagem.
  // Sempre neutra: sinalização, cones, barreiras, clima, ponte — nunca veículo acidentado,
  // pessoas ou vítimas, mesmo em notícia de acidente com morte.
  const TRUCK = '<g transform="translate(118 108)"><rect width="96" height="46" rx="4" fill="#F3F3F3"/><rect x="6" y="8" width="84" height="4" rx="2" fill="#1EFF95" opacity=".8"/><path d="M96 12h24l14 17v17H96Z" fill="#CFD1D0"/><rect x="104" y="17" width="14" height="10" rx="2" fill="#1E0D43"/><circle cx="22" cy="50" r="9" fill="#0F1814"/><circle cx="22" cy="50" r="3" fill="#9FA3A1"/><circle cx="78" cy="50" r="9" fill="#0F1814"/><circle cx="78" cy="50" r="3" fill="#9FA3A1"/><circle cx="120" cy="50" r="9" fill="#0F1814"/><circle cx="120" cy="50" r="3" fill="#9FA3A1"/></g>';
  const CONE = (x, s = 1) => `<g transform="translate(${x} 150) scale(${s})"><path d="M-12 0 0-34 12 0Z" fill="#FC3700"/><path d="M-7.5-13h15M-4.5-24h9" stroke="#F4F9FA" stroke-width="4"/><rect x="-16" y="0" width="32" height="5" rx="2" fill="#FC3700"/></g>`;
  const MOTIFS = {
    "Acidentes": `<g transform="translate(300 98)"><path d="M0-40 38 26H-38Z" fill="#FFCD00" stroke="#1E0D43" stroke-width="4" stroke-linejoin="round"/><path d="M0-14v20" stroke="#1E0D43" stroke-width="7" stroke-linecap="round"/><circle cy="16" r="4" fill="#1E0D43"/><rect x="-3" y="28" width="6" height="26" fill="#9FA3A1"/></g>${CONE(220)}${CONE(250, 0.85)}${CONE(355, 0.9)}`,
    "Interdições": '<g transform="translate(250 112)"><rect x="-110" y="-12" width="220" height="26" rx="4" fill="#F4F9FA"/><path d="M-100-12l16 26M-68-12l16 26M-36-12l16 26M-4-12l16 26M28-12l16 26M60-12l16 26M92-12l16 26" stroke="#FC3700" stroke-width="9"/><rect x="-100" y="14" width="7" height="26" fill="#9FA3A1"/><rect x="93" y="14" width="7" height="26" fill="#9FA3A1"/><circle cx="-96" cy="-20" r="7" fill="#FFCD00"/><circle cx="96" cy="-20" r="7" fill="#FFCD00"/></g>',
    "Obras": `${CONE(140)}${CONE(185, 0.9)}${CONE(230, 0.8)}<g transform="translate(320 96)"><path d="M0-34 34 0 0 34-34 0Z" fill="#FFCD00" stroke="#1E0D43" stroke-width="3"/><path d="M-12 12 4-6M8-14l6 6-8 8-6-6Z" stroke="#1E0D43" stroke-width="4" fill="#1E0D43"/><rect x="-3" y="34" width="6" height="22" fill="#9FA3A1"/></g>`,
    "Trânsito": '<g fill="#C6BDFC"><rect x="40" y="128" width="58" height="22" rx="7"/><rect x="112" y="128" width="58" height="22" rx="7"/><rect x="184" y="128" width="58" height="22" rx="7"/></g><rect x="256" y="124" width="86" height="26" rx="5" fill="#F3F3F3"/><g fill="#FC3700" opacity=".9"><circle cx="44" cy="138" r="3"/><circle cx="116" cy="138" r="3"/><circle cx="188" cy="138" r="3"/><circle cx="260" cy="136" r="3"/></g>',
    "Clima": '<g fill="#CFD1D0" opacity=".95"><ellipse cx="270" cy="62" rx="52" ry="24"/><ellipse cx="318" cy="72" rx="40" ry="20"/><ellipse cx="230" cy="74" rx="34" ry="17"/></g><g stroke="#00ACFF" stroke-width="3.5" stroke-linecap="round" opacity=".85"><path d="M232 102l-8 18"/><path d="M256 106l-8 18"/><path d="M280 102l-8 18"/><path d="M304 106l-8 18"/><path d="M328 102l-8 18"/></g><path d="M300 92l-12 20h12l-8 18" stroke="#FFCD00" stroke-width="4" fill="none" stroke-linejoin="round"/>' + TRUCK,
    "Roubo de carga": TRUCK + '<g transform="translate(312 96)"><path d="M0-36 32-23v21c0 22-15 36-32 42-17-6-32-20-32-42v-21Z" fill="#7758FF"/><rect x="-11" y="-6" width="22" height="18" rx="3" fill="#F4F9FA"/><path d="M-6-6v-6a6 6 0 0 1 12 0v6" stroke="#F4F9FA" stroke-width="4" fill="none"/></g>',
    "Greves": TRUCK + '<g transform="translate(316 96)"><circle r="30" fill="#E4C1F9"/><rect x="-11" y="-14" width="8" height="28" rx="2" fill="#1E0D43"/><rect x="3" y="-14" width="8" height="28" rx="2" fill="#1E0D43"/></g>',
    "Infraestrutura": `<path d="M40 130 Q200 60 360 130" stroke="#CFD1D0" stroke-width="6" fill="none"/><rect x="30" y="128" width="340" height="10" fill="#9FA3A1"/><g stroke="#CFD1D0" stroke-width="3"><path d="M90 102v26M140 84v44M200 76v52M260 84v44M310 102v26"/></g><rect x="60" y="138" width="12" height="14" fill="#6F7472"/><rect x="328" y="138" width="12" height="14" fill="#6F7472"/>${CONE(200, 0.8)}`,
    "Combustíveis e pedágios": '<g transform="translate(300 100)"><rect x="-26" y="-34" width="44" height="70" rx="6" fill="#1EFF95"/><rect x="-18" y="-24" width="28" height="18" rx="3" fill="#0F1814"/><path d="M18-14h10v34a6 6 0 0 1-12 0V6" stroke="#CFD1D0" stroke-width="5" fill="none"/><rect x="-32" y="36" width="56" height="8" rx="2" fill="#6F7472"/></g>' + TRUCK,
    "Outros": TRUCK,
  };

  function illustration(theme, level, variant = "card") {
    const accent = LEVEL[level]?.color || "#1EFF95";
    const id = `il-${Math.random().toString(36).slice(2, 7)}`;
    return `<svg class="news-illustration ${variant}" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustração: ${esc(theme)}">
      <defs>
        <linearGradient id="${id}s" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1E0D43"/><stop offset=".65" stop-color="#5029FF" stop-opacity=".5"/><stop offset="1" stop-color="#0F1814"/></linearGradient>
        <linearGradient id="${id}r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2A3E33"/><stop offset="1" stop-color="#0F1814"/></linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#${id}s)"/>
      <path d="M0 128 L70 96 L130 118 L210 88 L290 116 L350 100 L400 112 L400 160 L0 160Z" fill="#2A3E33" opacity=".7"/>
      <path d="M0 154 L400 154 L400 200 L0 200 Z" fill="url(#${id}r)"/>
      <g stroke="#F4F9FA" stroke-width="3" stroke-dasharray="18 16" opacity=".45"><path d="M0 180 L400 180"/></g>
      ${MOTIFS[theme] || MOTIFS.Outros}
      <rect x="0" y="0" width="400" height="4" fill="${accent}"/>
    </svg>`;
  }

  // Foto publicada pela fonte (quando existe) sobre a ilustração de reserva.
  // Se a imagem não carregar, o listener global remove o <img> e a ilustração aparece.
  function newsMedia(item, theme, level, variant) {
    const photo = urlOf(item?.image_url);
    const source = String(item?.source || "").trim();
    return `<div class="news-media">${illustration(theme, level, variant)}${photo
      ? `<img class="news-photo" src="${esc(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${source ? `<span class="news-credit">Imagem: ${esc(source)}</span>` : ""}`
      : ""}</div>`;
  }

  document.addEventListener("error", (event) => {
    const img = event.target;
    if (img && img.classList && img.classList.contains("news-photo")) {
      const credit = img.nextElementSibling;
      if (credit && credit.classList.contains("news-credit")) credit.remove();
      img.remove();
    }
  }, true);

  function sevBadge(level) {
    const meta = LEVEL[level] || LEVEL.low;
    return `<span class="sev-badge ${meta.cls}">${meta.label}</span>`;
  }

  function themeBadge(theme) {
    return `<span class="theme-badge" style="--theme:${THEME_COLOR[theme] || "#9FA3A1"}">${esc(theme)}</span>`;
  }

  const place = (e) => [e.road, e.uf].filter(Boolean).join(" / ");

  // ---------------- seções ----------------
  function renderKpis(data, bucketData) {
    const target = document.getElementById("dashKpis");
    if (!target) return;
    if (!target.querySelector(".kpi-card")) {
      target.innerHTML = METRICS.map((m) => `
        <article class="dash-card kpi-card tone-${m.tone}" data-kpi="${m.key}" tabindex="0" title="${esc(m.help)}">
          <div class="kpi-top"><span class="kpi-icon">${icon(m.icon)}</span><strong class="kpi-value" data-value="0">0</strong></div>
          <span class="kpi-label">${esc(m.label)}</span>
          <div class="kpi-bottom"><span class="kpi-delta-slot"></span><span class="kpi-spark"></span></div>
          <span class="kpi-tooltip" role="tooltip">${esc(m.help)}</span>
        </article>`).join("");
    }
    for (const m of METRICS) {
      const card = target.querySelector(`[data-kpi="${m.key}"]`);
      const cur = m.count(data.current);
      const prev = m.count(data.previous);
      animateNumber(card.querySelector(".kpi-value"), cur);
      card.querySelector(".kpi-delta-slot").innerHTML = delta(cur, prev, data.comparable);
      card.querySelector(".kpi-spark").innerHTML = sparkline(bucketData.list.map((b) => m.count(b.items)), m.tone);
    }
  }

  function featuredEvents(data) {
    const brief = window.RoadBrief.buildWeeklyBrief(data.all.map((e) => e.item), data.now, { windowMs: data.windowMs, includeEvents: true });
    const byUrl = new Map(data.current.map((e) => [e.item.url, e]));
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    // Bloqueio com notícia de liberação posterior na mesma rodovia não é destaque.
    const releasedLater = (ev) => ["block_total", "strike_block"].includes(ev.kind)
      && (brief.released || []).some((r) => r.road && r.road === ev.road && r.time && ev.time && r.time > ev.time);
    return brief.events
      .filter((ev) => rank[ev.level] >= 3 && !releasedLater(ev))
      .sort((a, b) => (rank[b.level] - rank[a.level]) || (b.sources - a.sources) || ((b.time || 0) - (a.time || 0)))
      .slice(0, 3)
      .map((ev) => {
        const source = byUrl.get(ev.url);
        const summary = source && typeof smartSummary === "function" ? smartSummary(source.item) : "";
        return { ...ev, summary, item: source?.item || { url: ev.url }, theme: source?.theme || themeOf(ev.kind, ""), source: source?.source || "" };
      });
  }

  function renderFeatured(data) {
    const target = document.getElementById("dashFeatured");
    if (!target) return;
    const events = featuredEvents(data);
    clearInterval(dash.featuredTimer);
    if (!events.length) {
      target.innerHTML = `<div class="featured-empty"><span class="kpi-icon">${icon("target")}</span><div><h2>Sem ocorrência de risco alto ou crítico no período</h2><p>As fontes monitoradas não registraram bloqueio, acidente grave ou alerta importante. Mantenha a checagem padrão antes das saídas.</p></div></div>`;
      return;
    }
    dash.featuredIndex = Math.min(dash.featuredIndex, events.length - 1);
    const show = (index) => {
      dash.featuredIndex = index;
      const ev = events[index];
      const url = urlOf(ev.url);
      target.innerHTML = `
        <div class="featured-media">${newsMedia(ev.item, ev.theme, ev.level, "hero")}</div>
        <div class="featured-overlay"></div>
        <div class="featured-body">
          <div class="featured-tags"><span class="featured-tag">Destaque</span>${sevBadge(ev.level)}${themeBadge(ev.theme)}</div>
          <h2>${esc(ev.title)}</h2>
          ${ev.summary ? `<p>${esc(shorten(ev.summary, 190))}</p>` : ""}
          <p class="featured-action"><strong>O que fazer:</strong> ${esc(ev.action)}</p>
          <div class="featured-meta">
            <span>${icon("clock")}${esc(dateLabel(ev.time))}</span>
            ${place(ev) ? `<span>${icon("pin")}${esc(place(ev))}</span>` : ""}
            ${ev.sources > 1 ? `<span>${ev.sources} fontes</span>` : ev.source ? `<span>${esc(ev.source)}</span>` : ""}
            ${url ? `<a class="featured-cta" href="${esc(url)}" target="_blank" rel="noopener">Ver notícia completa ${icon("arrow")}</a>` : ""}
          </div>
        </div>
        ${events.length > 1 ? `<div class="featured-dots" role="tablist">${events.map((_, i) => `<button type="button" role="tab" aria-label="Destaque ${i + 1}" aria-selected="${i === index}" data-featured="${i}" class="${i === index ? "active" : ""}"></button>`).join("")}</div>` : ""}`;
    };
    show(dash.featuredIndex);
    target.onclick = (event) => {
      const dot = event.target.closest("[data-featured]");
      if (dot) show(Number(dot.dataset.featured));
    };
    if (events.length > 1 && !reduceMotion()) {
      dash.featuredTimer = setInterval(() => {
        if (!target.matches(":hover") && !document.hidden) show((dash.featuredIndex + 1) % events.length);
      }, 9000);
    }
  }

  function renderTrend(data, bucketData) {
    const target = document.getElementById("dashTrend");
    if (!target) return;
    const series = bucketData.list.map((b) => ({ start: b.start, all: b.items.length, impact: b.items.filter((e) => e.risk.rank >= 2).length, prev: b.prev.length }));
    const totalNow = data.current.length;
    const totalPrev = data.previous.length;
    const pct = data.comparable && totalPrev ? Math.round(((totalNow - totalPrev) / totalPrev) * 100) : null;
    const w = 520, h = 190, padL = 30, padB = 26, padT = 10;
    const max = Math.max(1, ...series.map((s) => Math.max(s.all, data.comparable ? s.prev : 0)));
    const x = (i) => padL + (series.length > 1 ? (i * (w - padL - 8)) / (series.length - 1) : 0);
    const y = (v) => padT + (h - padT - padB) * (1 - v / max);
    const path = (key) => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`).join(" ");
    const ticks = [0, Math.round(max / 2), max];
    const label = (t) => new Date(t).toLocaleString("pt-BR", { timeZone: tz(), ...(dash.days === 1 ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }) });
    const every = Math.max(1, Math.ceil(series.length / 7));
    target.innerHTML = `
      <header class="dash-card-head">
        <h3>Tendência de notícias</h3>
        ${pct === null ? `<span class="dash-muted">${data.comparable ? "sem notícias no período anterior" : "sem base de comparação"}</span>` : `<span class="trend-pill ${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%</span>`}
      </header>
      <div class="trend-chart" data-trend>
        <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Notícias coletadas e com impacto por intervalo">
          <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>
          ${ticks.map((t) => `<g class="trend-grid"><line x1="${padL}" x2="${w - 8}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text></g>`).join("")}
          ${data.comparable ? `<path class="trend-prev" d="${path("prev")}"/>` : ""}
          <path class="trend-area" d="${path("all")} L${x(series.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z"/>
          <path class="trend-line" d="${path("all")}" pathLength="1"/>
          <path class="trend-impact" d="${path("impact")}"/>
          ${series.map((s, i) => `<g class="trend-point" data-i="${i}"><rect x="${x(i) - (w / series.length) / 2}" y="${padT}" width="${w / series.length}" height="${h - padT - padB}" fill="transparent"/><circle cx="${x(i)}" cy="${y(s.all)}" r="3.5"/></g>`).join("")}
          ${series.map((s, i) => (i % every === 0 || i === series.length - 1 ? `<text class="trend-x" x="${x(i)}" y="${h - 8}" text-anchor="middle">${esc(label(s.start))}</text>` : "")).join("")}
        </svg>
        <div class="trend-tooltip" hidden></div>
      </div>
      <div class="trend-legend"><span><i class="lg-all"></i>Coletadas</span><span><i class="lg-impact"></i>Com impacto na frota</span>${data.comparable ? `<span><i class="lg-prev"></i>Período anterior</span>` : ""}</div>`;
    const chart = target.querySelector("[data-trend]");
    const tip = chart.querySelector(".trend-tooltip");
    chart.onmousemove = (event) => {
      const point = event.target.closest(".trend-point");
      if (!point) { tip.hidden = true; return; }
      const s = series[Number(point.dataset.i)];
      tip.innerHTML = `<strong>${esc(label(s.start))}</strong><span>${s.all} coletada(s)</span><span>${s.impact} com impacto</span>${data.comparable ? `<span class="muted">${s.prev} no período anterior</span>` : ""}`;
      const box = chart.getBoundingClientRect();
      tip.style.left = `${Math.min(box.width - 150, Math.max(0, event.clientX - box.left + 12))}px`;
      tip.style.top = `${Math.max(0, event.clientY - box.top - 20)}px`;
      tip.hidden = false;
    };
    chart.onmouseleave = () => { tip.hidden = true; };
  }

  function renderThemes(data) {
    const target = document.getElementById("dashThemes");
    if (!target) return;
    const counts = new Map();
    for (const e of data.current) {
      if (e.risk.rank < 2) continue;
      counts.set(e.theme, (counts.get(e.theme) || 0) + 1);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((sum, [, n]) => sum + n, 0);
    if (!total) {
      target.innerHTML = `<header class="dash-card-head"><h3>Principais temas</h3></header><p class="dash-empty">Sem notícias com impacto no período.</p>`;
      return;
    }
    const r = 52, c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = rows.map(([name, n]) => {
      const len = (n / total) * c;
      const arc = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${THEME_COLOR[name]}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"><title>${esc(name)}: ${n} (${Math.round((n / total) * 100)}%)</title></circle>`;
      offset += len;
      return arc;
    }).join("");
    target.innerHTML = `
      <header class="dash-card-head"><h3>Principais temas</h3><span class="dash-muted">notícias com impacto</span></header>
      <div class="themes-body">
        <svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Distribuição por tema"><g transform="rotate(-90 70 70)">${arcs}</g>
          <text x="70" y="68" text-anchor="middle" class="donut-total">${total}</text><text x="70" y="86" text-anchor="middle" class="donut-sub">notícias</text></svg>
        <ul class="themes-legend">${rows.slice(0, 7).map(([name, n]) => `<li><i style="background:${THEME_COLOR[name]}"></i><span>${esc(name)}</span><strong>${Math.round((n / total) * 100)}%</strong><small>${n}</small></li>`).join("")}</ul>
      </div>`;
  }

  function renderPanorama(data) {
    const mapEl = document.getElementById("dashMap");
    const legend = document.getElementById("dashMapLegend");
    const hint = document.getElementById("dashMapHint");
    if (!mapEl || !legend) return;
    if (typeof canUseFeature === "function" && !canUseFeature("map", true)) {
      mapEl.innerHTML = `<p class="dash-empty">O mapa não está incluído no seu pacote.</p>`;
      legend.innerHTML = "";
      return;
    }
    const points = data.current
      .filter((e) => !e.inmet && e.risk.rank >= 2)
      .map((e, i) => (typeof buildMapPoint === "function" ? buildMapPoint(e.item, i) : null))
      .filter(Boolean);
    const levelOf = (p) => (p.riskKey === "critical" ? "critical" : p.riskKey === "high" ? "high" : p.riskKey === "medium" ? "medium" : "low");
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    points.forEach((p) => { counts[levelOf(p)] += 1; });
    legend.innerHTML = [["critical", "Crítico"], ["high", "Alto impacto"], ["medium", "Atenção"], ["low", "Informativo"]]
      .map(([k, label]) => `<li><i style="background:${LEVEL[k].color}"></i><span>${label}</span><strong>${counts[k]}</strong></li>`).join("");
    if (hint) hint.textContent = `${points.length} ponto(s) no período`;
    if (!window.L) return;
    if (!dash.map) {
      dash.map = L.map(mapEl, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, preferCanvas: true }).setView([-14.6, -52], 3);
      if (typeof addBaseTiles === "function") addBaseTiles(dash.map);
      dash.layer = L.layerGroup().addTo(dash.map);
    }
    dash.layer.clearLayers();
    for (const p of points) {
      const level = levelOf(p);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: level === "critical" ? 7 : 5.5,
        color: "#0F1814",
        weight: 1.5,
        fillColor: LEVEL[level].color,
        fillOpacity: 0.92,
        className: level === "critical" ? "pulse-marker" : "",
      });
      if (typeof mapPopup === "function") marker.bindPopup(mapPopup(p), { maxWidth: 320 });
      dash.layer.addLayer(marker);
    }
    setTimeout(() => dash.map?.invalidateSize(), 60);
  }

  function renderLatest(data) {
    const target = document.getElementById("dashLatest");
    if (!target) return;
    const filters = [["all", "Todas"], ["critical", "Críticas"], ["high", "Alto risco"], ["impact", "Com impacto"]];
    const keep = {
      all: () => true,
      critical: (e) => e.risk.rank === 4,
      high: (e) => e.risk.rank >= 3,
      impact: (e) => e.risk.rank >= 2,
    }[dash.filter] || (() => true);
    const list = data.current.filter((e) => !e.inmet).filter(keep).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 6);
    target.innerHTML = `
      <header class="dash-card-head">
        <h3>Últimas notícias</h3>
        <div class="chip-row" role="group" aria-label="Filtrar últimas notícias">${filters.map(([k, label]) => `<button type="button" class="chip ${dash.filter === k ? "active" : ""}" data-latest="${k}">${label}</button>`).join("")}</div>
        <button class="mini-button" type="button" data-route="/noticias" data-scroll="news">Ver todas →</button>
      </header>
      ${list.length ? `<div class="latest-grid">${list.map((e) => {
        const url = urlOf(e.item.url);
        const road = [e.road, ""].filter(Boolean).join("");
        return `<article class="latest-item">
          <div class="latest-thumb">${newsMedia(e.item, e.theme, e.risk.level, "thumb")}</div>
          <div class="latest-body">
            <h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(shorten(e.item.title, 110))}</a>` : esc(shorten(e.item.title, 110))}</h4>
            <div class="latest-meta"><span>${esc(e.source || "Fonte não informada")}</span><span>${esc(relative(e.time))}</span>${road ? `<span>${esc(road)}</span>` : ""}</div>
            <div class="latest-tags">${sevBadge(e.risk.level)}${themeBadge(e.theme)}${url ? `<a class="latest-link" href="${esc(url)}" target="_blank" rel="noopener">Detalhes ${icon("arrow")}</a>` : ""}</div>
          </div>
        </article>`;
      }).join("")}</div>` : `<p class="dash-empty">Nenhuma notícia para este filtro no período.</p>`}`;
    target.onclick = (event) => {
      const chip = event.target.closest("[data-latest]");
      if (!chip) return;
      dash.filter = chip.dataset.latest;
      renderLatest(dataset());
    };
  }

  function renderHead(data) {
    const subtitle = document.getElementById("dashSubtitle");
    const title = document.getElementById("dashTitle");
    const period = dash.days === 1 ? "últimas 24h" : `últimos ${dash.days} dias`;
    if (title) title.textContent = "Panorama das rodovias";
    if (subtitle) {
      const latest = data.all.reduce((max, e) => Math.max(max, e.time || 0), 0);
      const coverage = data.earliest && data.earliest > data.now - data.windowMs
        ? ` · dados disponíveis desde ${dateLabel(data.earliest)}`
        : "";
      subtitle.textContent = `Período: ${period}${latest ? ` · última coleta ${relative(latest)}` : ""}${coverage}`;
    }
    document.querySelectorAll("#topbarPeriod [data-dash-days]").forEach((b) => b.classList.toggle("active", Number(b.dataset.dashDays) === dash.days));
  }

  function render() {
    if (!window.RoadRisk || !window.RoadBrief) return;
    const data = dataset();
    const bucketData = buckets(data);
    renderHead(data);
    renderKpis(data, bucketData);
    renderFeatured(data);
    renderTrend(data, bucketData);
    renderThemes(data);
    renderLatest(data);
    if (isVisible()) renderPanorama(data);
    else dash.pendingMap = true;
    renderChrome(data);
  }

  function isVisible() {
    const page = document.getElementById("clientDashboardPage");
    return Boolean(page && !page.hidden && page.offsetParent !== null);
  }

  function onShow() {
    if (dash.pendingMap || !dash.map) {
      dash.pendingMap = false;
      setTimeout(() => renderPanorama(dataset()), 40);
    } else {
      setTimeout(() => dash.map.invalidateSize(), 60);
    }
  }

  // ---------------- cabeçalho, sidebar e tema ----------------
  function renderChrome(data = dataset()) {
    document.querySelectorAll(".icon-slot[data-icon]").forEach((slot) => {
      const name = slot.dataset.icon === "moon" ? (currentTheme() === "dark" ? "sun" : "moon") : slot.dataset.icon;
      slot.innerHTML = icon(name);
    });
    const searchIcon = document.querySelector(".topbar-search-icon");
    if (searchIcon && !searchIcon.innerHTML) searchIcon.innerHTML = icon("search");

    // Alertas importantes das últimas 24h.
    const since = Date.now() - DAY;
    const alerts = data.all.filter((e) => !e.inmet && e.time && e.time >= since && e.risk.rank >= 3).sort((a, b) => (b.risk.rank - a.risk.rank) || (b.time - a.time));
    const count = document.getElementById("topbarBellCount");
    if (count) {
      count.textContent = alerts.length > 99 ? "99+" : String(alerts.length);
      count.hidden = !alerts.length;
      count.classList.toggle("has-critical", alerts.some((e) => e.risk.rank === 4));
    }
    const panel = document.getElementById("topbarBellPanel");
    if (panel) {
      panel.innerHTML = `<div class="dropdown-head"><strong>Alertas importantes</strong><span>últimas 24h</span></div>
        ${alerts.length ? `<ul>${alerts.slice(0, 6).map((e) => {
          const url = urlOf(e.item.url);
          return `<li>${sevBadge(e.risk.level)}<div><a ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : ""}>${esc(shorten(e.item.title, 90))}</a><small>${esc([e.road, relative(e.time)].filter(Boolean).join(" · "))}</small></div></li>`;
        }).join("")}</ul>` : `<p class="dash-empty">Nenhum alerta alto ou crítico nas últimas 24h.</p>`}
        <button type="button" class="mini-button" data-route="/alertas" data-scroll="clientAlertsPage">Ver alertas</button>`;
    }

    // Usuário.
    const name = typeof getDisplayName === "function" ? getDisplayName() : "Usuário";
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "RN";
    const avatar = document.getElementById("topbarAvatar");
    if (avatar) avatar.textContent = initials;
    const userPanel = document.getElementById("topbarUserPanel");
    const logout = document.getElementById("sidebarLogoutButton");
    if (userPanel) {
      userPanel.innerHTML = `<div class="dropdown-head"><strong>${esc(name)}</strong><span>${esc(typeof roleLabel === "function" ? roleLabel() : "")}</span></div>
        ${logout && !logout.hidden ? `<button type="button" class="mini-button" data-topbar-logout>${icon("logout")} Sair</button>` : ""}`;
    }

    // Status da coleta na sidebar (sem afirmar "online" sem evidência: usa a última coleta).
    const status = document.getElementById("sidebarStatus");
    if (status) {
      const latest = data.all.reduce((max, e) => Math.max(max, e.time || 0), 0);
      const fresh = latest && Date.now() - latest < 3 * 3600e3;
      const last24 = Array.from({ length: 12 }, (_, i) => data.all.filter((e) => e.time && e.time >= Date.now() - (12 - i) * 2 * 3600e3 && e.time < Date.now() - (11 - i) * 2 * 3600e3).length);
      status.innerHTML = `<div class="status-row"><span class="status-dot ${fresh ? "ok" : "late"}"></span><strong>${latest ? (fresh ? "Coleta ativa" : "Coleta atrasada") : "Sem dados"}</strong></div>
        <small>${latest ? `Última notícia ${relative(latest)}` : "Aguardando a primeira coleta"}</small>${sparkline(last24, "green")}`;
    }
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    root.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* modo privado */ }
    setTimeout(() => root.classList.remove("theme-transition"), 350);
    renderChrome();
  }

  function toggleDropdown(button, panel, force) {
    const open = force ?? panel.hidden;
    document.querySelectorAll(".topbar-dropdown").forEach((p) => { if (p !== panel) p.hidden = true; });
    document.querySelectorAll(".topbar [aria-expanded]").forEach((b) => { if (b !== button) b.setAttribute("aria-expanded", "false"); });
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function bindTopbar() {
    const bell = document.getElementById("topbarBell");
    const bellPanel = document.getElementById("topbarBellPanel");
    const user = document.getElementById("topbarUser");
    const userPanel = document.getElementById("topbarUserPanel");
    bell?.addEventListener("click", (e) => { e.stopPropagation(); toggleDropdown(bell, bellPanel); });
    user?.addEventListener("click", (e) => { e.stopPropagation(); toggleDropdown(user, userPanel); });
    const closeAll = () => {
      document.querySelectorAll(".topbar-dropdown").forEach((p) => { p.hidden = true; });
      document.querySelectorAll(".topbar [aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    };
    document.addEventListener("click", (e) => {
      // Fora do menu, ou escolhendo algo dentro dele (link, "Ver alertas", "Sair"): fecha.
      if (!e.target.closest(".topbar-menu") || e.target.closest(".topbar-dropdown a, .topbar-dropdown button")) closeAll();
      if (e.target.closest("[data-topbar-logout]")) document.getElementById("sidebarLogoutButton")?.click();
    });
    window.addEventListener("popstate", closeAll);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".topbar-dropdown").forEach((p) => { p.hidden = true; });
    });
    document.getElementById("themeToggle")?.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
    document.getElementById("topbarPeriod")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dash-days]");
      if (!b) return;
      dash.days = Number(b.dataset.dashDays) || 7;
      render();
    });
    document.getElementById("topbarSearch")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = document.getElementById("topbarSearchInput").value.trim();
      const global = document.getElementById("globalSearch");
      if (global) global.value = value;
      if (typeof applyRoute === "function") await applyRoute("/noticias", { scroll: "news" });
      if (typeof syncClientFilters === "function") syncClientFilters();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindTopbar);
  else bindTopbar();

  window.RoadDashboard = { render, renderChrome, onShow, applyTheme };
})();
