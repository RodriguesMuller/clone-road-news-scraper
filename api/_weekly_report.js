// Indicadores extras do boletim semanal em PDF (só para a exportação ao cliente; o e-mail não usa).
// Recebe as ocorrências já agrupadas por buildWeeklyBrief(..., { includeEvents: true }).

const GROUPS = [
  ["Bloqueios e interdições", ["block_total", "block_partial", "strike_block"]],
  ["Bloqueios programados/obras", ["block_planned", "block_partial_planned", "structural", "traffic"]],
  ["Acidentes com veículo pesado", ["heavy_vehicle", "hazmat"]],
  ["Outros acidentes", ["fatal_accident", "accident", "accident_partial", "accident_jam", "jam"]],
  ["Roubo de carga", ["cargo_theft", "cargo_theft_police"]],
  ["Paralisações/manifestações", ["strike", "strike_over"]],
  ["Clima, fogo e visibilidade", ["weather", "visibility", "fire", "small_fire"]],
];
const LEVELS = [["critical", "Crítico"], ["high", "Alto"], ["medium", "Médio"]];

function groupOf(kind) {
  const found = GROUPS.find(([, kinds]) => kinds.includes(kind));
  return found ? found[0] : "Outros";
}

function ranked(map, limit) {
  return [...map.entries()]
    .sort((a, b) => (b[1].events - a[1].events) || (b[1].severe - a[1].severe) || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([label, v]) => ({ label, events: v.events, severe: v.severe }));
}

function weeklyReport(events = []) {
  const byLevel = Object.fromEntries(LEVELS.map(([key]) => [key, 0]));
  const byGroup = new Map();
  const byUf = new Map();
  const roads = new Set();
  for (const event of events) {
    if (event.level in byLevel) byLevel[event.level] += 1;
    const severe = event.level === "critical" || event.level === "high" ? 1 : 0;
    const add = (map, key) => {
      const entry = map.get(key) || { events: 0, severe: 0 };
      entry.events += 1;
      entry.severe += severe;
      map.set(key, entry);
    };
    add(byGroup, groupOf(event.kind));
    if (event.uf) add(byUf, event.uf);
    if (event.road) roads.add(event.road);
  }
  return {
    events: events.length,
    severe: byLevel.critical + byLevel.high,
    roads: roads.size,
    states: byUf.size,
    by_level: LEVELS.map(([key, label]) => ({ key, label, events: byLevel[key] })),
    by_category: ranked(byGroup, GROUPS.length + 1),
    by_state: ranked(byUf, 8),
  };
}

module.exports = { weeklyReport, groupOf };
