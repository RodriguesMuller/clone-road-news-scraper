/*
 * Régua única de risco operacional do Road News (Baixo / Médio / Alto / Crítico).
 *
 * Mede o IMPACTO NA OPERAÇÃO DA FROTA (a via está disponível? a carga corre risco?),
 * não a gravidade humana do fato. Uma morte em acidente já encerrado pesa menos para a
 * rota do que uma rodovia fechada sem previsão.
 *
 *   Crítico — via indisponível AGORA ou carga sob ameaça imediata: bloqueio total em curso,
 *             manifestação bloqueando a pista, INMET "Grande Perigo".
 *   Alto    — impacto forte e provável: veículo pesado tombado/incendiado, acidente com vítima
 *             fatal ou produto perigoso, dano estrutural, roubo de carga, greve/protesto
 *             anunciado, bloqueio total PROGRAMADO, clima severo, INMET "Perigo".
 *   Médio   — atraso ou atenção: acidente sem sinal de interdição, bloqueio parcial, obra,
 *             congestionamento, neblina, INMET "Perigo Potencial", corredor internacional.
 *   Baixo   — sem impacto atual: trecho liberado, fato fora do Brasil, desdobramento
 *             (justiça, luto, homenagem, simulado, boato) ou nada operacional.
 *
 * Usado no navegador (window.RoadRisk) e no Node (require). O espelho em Python é
 * scraper/utils/risk.py; os dois são validados pelo mesmo conjunto de exemplos em
 * docs/domain/risk_golden.json.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoadRisk = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LEVELS = {
    critical: { rank: 4, label: "Crítico", ascii: "Critico" },
    high: { rank: 3, label: "Alto", ascii: "Alto" },
    medium: { rank: 2, label: "Médio", ascii: "Medio" },
    low: { rank: 1, label: "Baixo", ascii: "Baixo" },
  };

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
  }

  const UF = "br|ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|ers|rsc|mgc|amg|prc|spa|spi";
  const ROAD_CODE = new RegExp(`\\b(?:${UF})-?\\s?\\d{2,4}\\b`);
  const STATE_NAMES = "acre|alagoas|amapa|amazonas|bahia|ceara|distrito federal|espirito santo|goias|maranhao|mato grosso|minas gerais|paraiba|parana|pernambuco|piaui|rio de janeiro|rio grande do norte|rio grande do sul|rondonia|roraima|santa catarina|sao paulo|sergipe|tocantins";
  // Rodovias que as notícias citam só pelo nome, sem "rodovia" nem código.
  const NAMED_HIGHWAYS = "dutra|raposo tavares|castell?o branco|fernao dias|regis bittencourt|anhanguera|bandeirantes|washington luis|imigrantes|anchieta|tamoios|carvalho pinto|ayrton senna|dom pedro|rio-santos|rodoanel|ponte rio-niteroi|transamazonica|belem-brasilia";

  // --- Bloqueio de rodovia ------------------------------------------------------------
  const BLOCK_ROAD_CONTEXT = new RegExp(`${ROAD_CODE.source}|rodovi|estrada|pista|ponte|viaduto|trecho|\\bkm\\s*\\d|\\bvia\\b|serra|\\balca\\b|marginal|${NAMED_HIGHWAYS}`);
  const BLOCK_RELEASED = /\b(?:liberad[ao]s?|desbloquead[ao]s?|reabert[ao]s?|normalizad[ao]s?|retomad[ao]s?)\b|transito normal|fluxo normal|libera(?:cao)? total/;
  const BLOCK_STILL_ACTIVE = /(?:segue|continua|permanece) (?:totalmente )?(?:bloquead|interditad|fechad)|sem previsao de liberacao/;
  const BLOCK_PARTIAL = /interdicao parcial|bloqueio parcial|parcialmente (?:bloquead|interditad|fechad)|meia pista|pare[- ]?e[- ]?siga|faixas? (?:interditada|bloqueada)|(?:interdicao|bloqueio) de faixa|(?:bloqueia|interdita|ocupa)m? (?:a |as )?(?:uma|duas|tres|\d) faixas?|uma (?:das )?faixas?|uma pista/;
  const BLOCK_TOTAL = /bloqueio total|interdicao total|totalmente (?:bloquead|interditad|fechad)|\bbloquead[ao]s?\b|\binterditad[ao]s?\b|\binterditam?\b|\bbloqueiam?\b|\bbloqueio\b|\binterdicao\b|\bbloquear\b|\binterditar\b|\bfechad[ao]s?\b|\bfecha(?:m)? (?:a |o )?(?:ponte|pista|rodovia|br|trecho|via|estrada)|desabamento de ponte|ponte (?:cai|caiu|desaba)/;

  function textOf(item) {
    return normalize(`${item?.title || ""} ${item?.summary || ""}`);
  }

  function roadBlockLevel(item) {
    if (item && typeof item.block_level === "string") return item.block_level;
    const text = textOf(item);
    if (!BLOCK_ROAD_CONTEXT.test(text)) return "";
    if (BLOCK_RELEASED.test(text) && !BLOCK_STILL_ACTIVE.test(text)) return "";
    if (BLOCK_PARTIAL.test(text)) return "partial";
    if (BLOCK_TOTAL.test(text)) return "total";
    return "";
  }

  // --- Sinais --------------------------------------------------------------------------
  const P = {
    foreign: /\b(?:bulgaria|estados unidos|argentina|chile|paraguai|uruguai|bolivia|colombia|venezuela|mexico|canada|china|india|japao|coreia|russia|ucrania|franca|alemanha|italia|espanha|portugal|reino unido|inglaterra|turquia|israel|egito|africa do sul|australia|nova zelandia)\b/,
    intlCorridor: /ormuz|hormuz|suez|mar vermelho|red sea|bab el.mandeb|canal do panama|panama canal/,
    aftermath: /\b(?:denunciad|condenad|julgament|indenizac|processad[ao]|inquerito|velorio|sepultad|enterro|luto|homenage|relembra|superfaturamento)|identificad[ao]s? (?:as )?(?:\w+ )?vitimas|morre aos \d+ anos|\b(?:checagem|boato|fake news|desmente|negam)\b|e antig[ao]\b|fora de contexto/,
    simulation: /\bsimulado\b|\bexercicio simulado\b/,
    planned: /\b(?:tera|terao)\b|\bvai (?:ter|bloquear|interditar|fechar)|\bsera (?:totalmente |parcialmente )?(?:bloquead|interditad|fechad)|\bprogramad[ao]|\bagendad[ao]|previst[ao] (?:para|nest[ae]|no |na )|esta previst|para (?:reparos|obras|manutencao|desmonte)|a partir de (?:amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d)/,
    grandePerigo: /grande perigo/,
    perigoPotencial: /perigo potencial/,
    perigo: /\bperigo\b/,
    strike: /\bgreve\b|paralisac|manifestac|protesto/,
    strikeRelevant: /caminhoneir|transportador|rodovi|estrada|porto d[eo]s?\b|portuari|\bpista\b|\bbr-?\s?\d/,
    strikeOver: /\bnegativa\b|\bnega(?:m)?\b|descarta|nao (?:ha|haver) indicac|sem indicac|encerrad[ao]|\bretoma(?:m|da)?\b|fim da (?:greve|paralisacao)|suspend(?:e|em|ida)|cancelad[ao]|desmobiliz/,
    cargoTheft: /roubo de carga|furto de carga|roubo.{0,25}(?:caminh|carreta|carga)|assalt.{0,30}(?:caminh|motorista|carga|carreta)|\bsaque|saquead|quadrilha.{0,40}(?:carga|caminh)/,
    police: /\bprend(?:e|em|eu|eram)\b|\bpres[oa]s?\b(?! (?:as|nas) ferragens)|\bprisao\b|\brecuperad[ao]s?\b|\brecupera\b|apreend|desarticul|operacao policial/,
    structural: /queda de barreira|deslizamento|cratera|erosao|afundamento|desaba|(?:acostamento|pista|aterro) ced|rompimento/,
    heavy: /caminh(?:ao|oes)|carreta|bitrem|rodotrem|treminhao|cegonha|\bonibus\b|caminhao-tanque|\bpesado/,
    accident: /acidente|colis|batid|\bbate(?:u|m)?\b|engavet|tomb|capot|choque|sai(?:u)? da pista|perde(?:u)? (?:o )?controle|atropel|ribanceira/,
    heavyDramatic: /tomb|capot|engavet|pega(?:m)? fogo|incendi|em chamas|ribanceira/,
    smallFire: /principio de incendio|incendio (?:atinge|em) pneus/,
    fire: /pega(?:m)? fogo|incendio|em chamas/,
    hazmat: /produtos? perigosos?|inflamave|combustivel|toxic|quimic|explosiv|derramamento de (?:oleo|combustivel|produto)|vazamento|caminhao-tanque|\bgas\b/,
    fatality: /\bmort[eoa]s?\b|\bmorr(?:e|eu|em|eram|endo)\b|\bmat(?:a|ou|aram|ando)\b|\bfatal\b|\bobito\b|perde a vida|perdeu a vida/,
    noCasualties: /sem feridos?\b|sem vitimas?\b|sem mortos?\b|nenhuma vitima|nao houve (?:ferido|morte|vitima)/,
    bigJam: /\b(?:[5-9]|\d{2,})\s*km de (?:fila|congestionamento|lentidao)/,
    traffic: /congestion|lentid|\bfila\b|transito (?:parado|lento|complicad)|complica (?:o )?transito|afeta (?:o )?transito|atrasos?\b/,
    weatherSevere: /tempestade|temporal|alagamento|alagad|enchente|inundac|granizo|vendaval|ciclone/,
    visibility: /neblina|nevoeiro|baixa visibilidade|fumaca/,
    minor: /\bobras?\b|manutencao|recapeamento|sinalizacao|chuva|fiscalizac|\bbalanca\b|radar|restric|proib/,
    location: new RegExp(`${ROAD_CODE.source}|rodovi|estrada|\\bkm\\s*\\d|\\bvia\\b|serra|ponte|viaduto|marginal|${NAMED_HIGHWAYS}|\\b(?:${STATE_NAMES})\\b|(?:\\bem|\\bno|\\bna|,|\\()\\s?(?:${UF.split("|").slice(1, 28).join("|")})\\b`),
  };

  // Tipo de ocorrência (usado pelo resumo semanal para agrupar e sugerir ação).
  const KIND_BY_REASON = [
    ["Corredor logístico internacional", "intl"], ["Ocorrência fora do Brasil", "foreign"], ["Desdobramento", "aftermath"],
    ["Aviso INMET de Grande Perigo", "inmet_red"], ["Aviso INMET de Perigo Potencial", "inmet_yellow"], ["Aviso INMET de Perigo", "inmet_orange"],
    ["Aviso meteorológico", "inmet"], ["Trecho liberado", "released"], ["Simulado", "simulation"],
    ["Bloqueio total programado", "block_planned"], ["Manifestação bloqueando", "strike_block"], ["Rodovia totalmente bloqueada", "block_total"],
    ["Paralisação negada", "strike_over"], ["Paralisação ou manifestação", "strike"], ["Ação policial", "cargo_theft_police"],
    ["Roubo de carga", "cargo_theft"], ["Dano estrutural", "structural"], ["Acidente com produto perigoso", "hazmat"],
    ["Princípio de incêndio", "small_fire"], ["Veículo pesado", "heavy_vehicle"], ["Acidente com interdição parcial", "accident_partial"],
    ["Acidente com congestionamento", "accident_jam"], ["Acidente com vítima fatal", "fatal_accident"], ["Acidente sem sinal", "accident"],
    ["Interdição parcial programada", "block_partial_planned"], ["Bloqueio parcial", "block_partial"], ["Congestionamento extenso", "jam"],
    ["Clima severo", "weather"], ["Baixa visibilidade", "visibility"], ["Incêndio próximo", "fire"], ["Lentidão, obra", "traffic"],
  ];

  function result(level, reason) {
    const meta = LEVELS[level];
    const kind = (KIND_BY_REASON.find(([prefix]) => reason.startsWith(prefix)) || [null, "none"])[1];
    return { level, rank: meta.rank, label: meta.label, ascii: meta.ascii, reason, kind };
  }

  // Só pela origem do registro: o texto de notícia comum pode citar o INMET.
  function isInmet(item) {
    return item?.type === "INMET" || /inmet/i.test(item?.source || "");
  }

  function rawClassify(item, text) {
    const hasRoad = ROAD_CODE.test(text);
    const country = normalize(item?.country);

    if (P.intlCorridor.test(text)) return result("medium", "Corredor logístico internacional: impacto indireto em frete e combustível, não na via.");
    if ((country && country !== "brasil") || (P.foreign.test(text) && !hasRoad)) return result("low", "Ocorrência fora do Brasil, sem efeito direto nas rotas.");
    if (P.aftermath.test(text)) return result("low", "Desdobramento de fato anterior (justiça, luto, homenagem ou boato), sem impacto atual na via.");

    if (isInmet(item, text)) {
      if (P.grandePerigo.test(text)) return result("critical", "Aviso INMET de Grande Perigo: fenômeno excepcional, alta chance de interdições.");
      if (P.perigoPotencial.test(text)) return result("medium", "Aviso INMET de Perigo Potencial: atenção a chuva e vento, risco baixo de interdição.");
      if (P.perigo.test(text)) return result("high", "Aviso INMET de Perigo: risco de alagamento, queda de árvore e interdição pontual.");
      return result("medium", "Aviso meteorológico do INMET.");
    }

    const block = roadBlockLevel(item);
    const planned = P.planned.test(text);
    const released = BLOCK_RELEASED.test(text) && !BLOCK_STILL_ACTIVE.test(text) && BLOCK_ROAD_CONTEXT.test(text);
    if (released && !block) return result("low", "Trecho liberado: a via volta a ser opção.");
    if (P.simulation.test(text) && !block) return result("low", "Simulado, sem ocorrência real na via.");

    if (block === "total") {
      if (planned || P.simulation.test(text)) return result("high", "Bloqueio total programado: planeje o desvio para a data e horário informados.");
      if (P.strike.test(text)) return result("critical", "Manifestação bloqueando a rodovia.");
      return result("critical", "Rodovia totalmente bloqueada: trecho indisponível até a liberação.");
    }

    if (P.strike.test(text) && P.strikeRelevant.test(text)) {
      if (P.strikeOver.test(text)) return result("low", "Paralisação negada, suspensa ou encerrada: sem bloqueio em curso.");
      return result("high", "Paralisação ou manifestação ligada ao transporte: risco de bloqueio a qualquer momento.");
    }

    if (P.cargoTheft.test(text)) {
      if (P.police.test(text)) return result("medium", "Ação policial contra roubo de carga: indica trecho visado, sem ameaça em curso.");
      return result("high", "Roubo de carga: risco direto à carga e ao motorista no trecho.");
    }

    if (P.structural.test(text) && BLOCK_ROAD_CONTEXT.test(text)) return result("high", "Dano estrutural na pista: risco de interdição e restrição de peso.");

    const accident = P.accident.test(text);
    const heavy = P.heavy.test(text);
    const casualtiesDenied = P.noCasualties.test(text);
    if (accident || (heavy && P.fire.test(text))) {
      if (P.hazmat.test(text)) return result("high", "Acidente com produto perigoso: interdição e contenção costumam ser longas.");
      if (heavy && P.smallFire.test(text)) return result("medium", "Princípio de incêndio em veículo pesado, controlado no local.");
      if (heavy && P.heavyDramatic.test(text)) return result("high", "Veículo pesado tombado ou incendiado: interdição de faixas e remoção demorada.");
      if (block === "partial") return result("high", "Acidente com interdição parcial: fila e atraso no trecho.");
      if (P.bigJam.test(text)) return result("high", "Acidente com congestionamento extenso.");
      if (P.fatality.test(text) && !casualtiesDenied) return result("high", "Acidente com vítima fatal: a perícia costuma interditar o trecho por horas.");
      return result("medium", "Acidente sem sinal de interdição: possível lentidão pontual.");
    }

    if (block === "partial") return result("medium", planned ? "Interdição parcial programada: inclua margem de tempo." : "Bloqueio parcial: fila e atraso prováveis.");
    if (P.bigJam.test(text)) return result("high", "Congestionamento extenso no trecho.");
    if (P.weatherSevere.test(text)) return result("high", "Clima severo na via: risco de alagamento e interdição.");
    if (P.visibility.test(text)) return result("medium", "Baixa visibilidade: risco de acidente, evite os horários críticos.");
    if (P.fire.test(text)) return result("medium", "Incêndio próximo à via: possível fumaça e lentidão.");
    if (P.traffic.test(text) || P.minor.test(text)) return result("medium", "Lentidão, obra ou restrição: atraso provável.");
    return result("low", "Sem impacto operacional identificado na notícia.");
  }

  function classifyRisk(item) {
    const text = textOf(item);
    const base = rawClassify(item, text);
    // Sem localização identificável não pode ser Alto/Crítico (régua de logistics-intelligence).
    const located = P.location.test(text) || item?.highway || item?.city || item?.state || item?.region || isInmet(item, text);
    const fatal = P.fatality.test(text) && !P.noCasualties.test(text) && P.accident.test(text);
    if (!located && base.rank >= 3) {
      return { ...result("medium", base.reason), reason: `${base.reason} Sem rodovia ou local identificado na notícia.`, kind: base.kind, fatal, needs_geo_review: true };
    }
    return { ...base, fatal };
  }

  return { LEVELS, normalize, classifyRisk, roadBlockLevel, BLOCK_ROAD_CONTEXT, BLOCK_RELEASED, BLOCK_STILL_ACTIVE };
});
