#!/usr/bin/env node
/**
 * Consolida /product e /docs (Markdown) em um único PDF versionado sempre no
 * mesmo caminho: docs/dist/road-news-documentation.pdf. Nunca cria um segundo
 * arquivo, nunca sufixa por data/versão. Idempotente: só regenera quando o
 * hash do conteúdo-fonte muda.
 *
 * Dono deste arquivo: docs-publisher (.claude/agents/docs-publisher.md).
 * Uso: node scripts/build-docs-pdf.js [--force]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const REPO_ROOT = path.resolve(__dirname, '..');
const PRODUCT_DIR = path.join(REPO_ROOT, 'product');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const ADR_DIR = path.join(DOCS_DIR, 'adr');
const HISTORY_FILE = path.join(DOCS_DIR, 'HISTORY.md');
const OUTPUT_DIR = path.join(DOCS_DIR, 'dist');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'road-news-documentation.pdf');
const MANIFEST_FILE = path.join(OUTPUT_DIR, '.docs-pdf-manifest.json');
const TEMP_HTML = path.join(OUTPUT_DIR, '.build-tmp.html');
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

const PART_I_ORDER = [
  'VISION', 'PITCH', 'BUSINESS_MODEL', 'PRICING', 'PERSONAS',
  'VALUE_PROPOSITION', 'MARKET', 'FEATURES', 'COMPETITORS', 'FAQ',
  'ONBOARDING', 'SALES',
];

const PART_II_ORDER = [
  'ARCHITECTURE', 'DATABASE', 'API', 'SCRAPERS', 'AI_PIPELINE',
  'DEPLOY', 'ENVIRONMENT', 'SECURITY', 'CONTRIBUTING', 'ROADMAP', 'CHANGELOG',
];

function toTitle(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function slugify(text) {
  return (
    text
      .normalize('NFD')
      .replace(DIACRITICS_PATTERN, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '')
      .slice(0, 60) || 'secao'
  );
}

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name);
}

function collectOrdered(dir, order, extraSeed = []) {
  const items = [];
  const seen = new Set(extraSeed.map((s) => s.toLowerCase()));
  for (const name of order) {
    const fileName = `${name}.md`;
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) {
      items.push({ title: toTitle(name), filePath });
      seen.add(fileName.toLowerCase());
    }
  }
  const extras = listMdFiles(dir)
    .filter((f) => !seen.has(f.toLowerCase()))
    .sort();
  for (const extra of extras) {
    items.push({ title: toTitle(extra.replace(/\.md$/i, '')), filePath: path.join(dir, extra) });
  }
  return items;
}

function collectProductSection() {
  return collectOrdered(PRODUCT_DIR, PART_I_ORDER);
}

function collectAdrFiles() {
  return listMdFiles(ADR_DIR)
    .sort() // nomes começam com NNNN- → ordem cronológica por convenção do projeto
    .map((f) => ({ title: toTitle(f.replace(/\.md$/i, '')), filePath: path.join(ADR_DIR, f) }));
}

function collectDocsSection() {
  const items = [];
  const readmePath = path.join(REPO_ROOT, 'README.md');
  if (fs.existsSync(readmePath)) items.push({ title: 'README', filePath: readmePath });
  items.push(...collectOrdered(DOCS_DIR, PART_II_ORDER, ['readme.md']));
  items.push(...collectAdrFiles());
  return items;
}

function toPosixRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function computeSourceHash(items) {
  const hash = crypto.createHash('sha256');
  const sorted = items.slice().sort((a, b) => a.filePath.localeCompare(b.filePath));
  for (const item of sorted) {
    hash.update(toPosixRelative(item.filePath));
    hash.update('\n');
    hash.update(fs.readFileSync(item.filePath));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function latestHistorySummary() {
  const content = fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8') : null;
  if (!content) return 'Publicação inicial da documentação consolidada.';
  const match = content.match(/\*\*O que mudou:\*\*\s*(.+)/);
  return match ? match[1].trim() : 'Atualização de documentação (ver docs/HISTORY.md).';
}

function cleanStrayPdfs() {
  const removed = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf') && full !== OUTPUT_PDF) {
        fs.unlinkSync(full);
        removed.push(toPosixRelative(full));
      }
    }
  };
  walk(REPO_ROOT);
  return removed;
}

function createMarkdownRenderer() {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0].toLowerCase();
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
  return md;
}

function injectHeadingIds(html, prefix) {
  const seen = new Set();
  const toc = [];
  const withIds = html.replace(/<h([1-3])>(.*?)<\/h\1>/gs, (full, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const base = `${prefix}-${slugify(text)}`;
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    toc.push({ level: Number(level), text, id });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: withIds, toc };
}

function renderSections(md, items, counterStart) {
  let counter = counterStart;
  const rendered = [];
  const tocEntries = [];
  for (const item of items) {
    counter += 1;
    const raw = fs.readFileSync(item.filePath, 'utf8');
    const bodyHtml = md.render(raw);
    const prefix = `sec-${counter}`;
    const { html, toc } = injectHeadingIds(bodyHtml, prefix);
    const h1 = toc.find((t) => t.level === 1);
    const label = h1 ? h1.text : item.title;
    rendered.push(`<section class="doc-file" id="${prefix}">${html}</section>`);
    tocEntries.push({ id: prefix, label });
  }
  return { html: rendered.join('\n'), tocEntries, nextCounter: counter };
}

function renderChangelogPage(entries) {
  const rows = entries
    .slice(0, 20)
    .map((e) => `<tr><td>${e.date}</td><td>${escapeHtml(e.summary)}</td></tr>`)
    .join('\n');
  return `
  <section class="changelog-page">
    <h1>Changelog de publicação do PDF</h1>
    <p class="muted">Histórico de quando este PDF foi regenerado e o que mudou desde a publicação anterior — não confundir com o CHANGELOG.md do produto.</p>
    <table>
      <thead><tr><th>Data</th><th>O que mudou</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">Primeira publicação.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtmlDocument({ productItems, docsItems, changelogEntries, generatedAtLabel }) {
  const md = createMarkdownRenderer();
  const partI = renderSections(md, productItems, 0);
  const partII = renderSections(md, docsItems, partI.nextCounter);

  const tocList = (entries, partTitle) =>
    entries.length
      ? `<h3>${partTitle}</h3><ol>${entries.map((e) => `<li><a href="#${e.id}">${escapeHtml(e.label)}</a></li>`).join('')}</ol>`
      : `<h3>${partTitle}</h3><p class="muted">Nenhum documento publicado ainda nesta parte.</p>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Road News — Documentação</title>
<script src="${MERMAID_CDN}"></script>
<style>
  @page { margin: 22mm 16mm; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.5; font-size: 12px; }
  h1 { font-size: 22px; margin-top: 0; }
  h2 { font-size: 17px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 14px; }
  code, pre { font-family: "Consolas", "SF Mono", monospace; font-size: 10.5px; }
  pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  .muted { color: #666; font-style: italic; }
  .cover { height: 240mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover h1 { font-size: 34px; margin-bottom: 6px; }
  .cover p { font-size: 15px; color: #444; }
  .cover .date { margin-top: 40px; font-size: 12px; color: #888; }
  .toc { page-break-after: always; }
  .toc ol { padding-left: 22px; }
  .part-divider { page-break-before: always; }
  .part-divider h1 { font-size: 26px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; }
  .doc-file { margin-bottom: 22px; }
  .changelog-page { page-break-before: always; }
  .mermaid { background: #fafafa; border: 1px solid #eee; padding: 8px; text-align: center; }
</style>
</head>
<body>
  <div class="cover">
    <h1>Road News — Documentação</h1>
    <p>Inteligência operacional para transporte rodoviário de cargas</p>
    <p class="date">Última atualização: ${generatedAtLabel}</p>
  </div>

  <nav class="toc">
    <h2>Sumário</h2>
    ${tocList(partI.tocEntries, 'Parte I — Visão de Produto')}
    ${tocList(partII.tocEntries, 'Parte II — Documentação Técnica')}
    <h3>Changelog de publicação do PDF</h3>
  </nav>

  <section class="part-divider">
    <h1>Parte I — Visão de Produto</h1>
    ${partI.html || '<p class="muted">Nenhum documento em /product ainda. Esta parte será preenchida quando product-docs-agent publicar conteúdo.</p>'}
  </section>

  <section class="part-divider">
    <h1>Parte II — Documentação Técnica</h1>
    ${partII.html}
  </section>

  ${renderChangelogPage(changelogEntries)}

  <script>
    window.__mermaidStatus = 'pending';
    (async () => {
      try {
        if (window.mermaid) {
          window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
          await window.mermaid.run({ querySelector: '.mermaid' });
        }
        window.__mermaidStatus = 'done';
      } catch (err) {
        window.__mermaidStatus = 'failed';
        console.error('mermaid render failed', err);
      }
    })();
  </script>
</body>
</html>`;
}

async function renderPdf(html) {
  fs.writeFileSync(TEMP_HTML, html, 'utf8');
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${TEMP_HTML}`, { waitUntil: 'networkidle0', timeout: 60000 });
    try {
      await page.waitForFunction(
        () => window.__mermaidStatus === 'done' || window.__mermaidStatus === 'failed',
        { timeout: 15000 }
      );
    } catch {
      // Sem rede ou mermaid não carregou a tempo: segue com os blocos como código estilizado.
    }
    await page.pdf({
      path: OUTPUT_PDF,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#888;text-align:center;padding:0 16mm;">' +
        'Road News — Documentação · página <span class="pageNumber"></span> de <span class="totalPages"></span>' +
        '</div>',
      margin: { top: '22mm', bottom: '18mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await browser.close();
    if (fs.existsSync(TEMP_HTML)) fs.unlinkSync(TEMP_HTML);
  }
}

function estimatePageCount() {
  try {
    const bytes = fs.readFileSync(OUTPUT_PDF, 'latin1');
    const matches = bytes.match(/\/Type\s*\/Page[^s]/g);
    return matches ? matches.length : null;
  } catch {
    return null;
  }
}

async function main() {
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const removedPdfs = cleanStrayPdfs();
  if (removedPdfs.length) {
    console.log(`[docs-publisher] PDF(s) solto(s) removido(s): ${removedPdfs.join(', ')}`);
  }

  const productItems = collectProductSection();
  const docsItems = collectDocsSection();
  const allItems = [...productItems, ...docsItems];

  console.log(`[docs-publisher] Parte I (produto): ${productItems.length} arquivo(s) — ${productItems.map((i) => toPosixRelative(i.filePath)).join(', ') || 'nenhum'}`);
  console.log(`[docs-publisher] Parte II (técnica): ${docsItems.length} arquivo(s) — ${docsItems.map((i) => toPosixRelative(i.filePath)).join(', ') || 'nenhum'}`);

  const sourceHash = computeSourceHash(allItems);
  const previousManifest = readManifest();

  if (!force && previousManifest && previousManifest.source_hash === sourceHash && fs.existsSync(OUTPUT_PDF)) {
    console.log('[docs-publisher] Documentação sem alterações desde a última publicação. PDF não regenerado.');
    return;
  }

  const generatedAt = new Date();
  const generatedAtLabel = generatedAt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const changelogSummary = latestHistorySummary();
  const previousChangelog = (previousManifest && previousManifest.changelog) || [];
  const newEntry = { date: generatedAt.toISOString().slice(0, 10), summary: changelogSummary };
  const changelogEntries =
    previousChangelog[0] && previousChangelog[0].summary === newEntry.summary
      ? previousChangelog
      : [newEntry, ...previousChangelog].slice(0, 30);

  const html = buildHtmlDocument({ productItems, docsItems, changelogEntries, generatedAtLabel });
  await renderPdf(html);

  const manifest = {
    last_built_at: generatedAt.toISOString(),
    source_hash: sourceHash,
    source_files: allItems.map((i) => toPosixRelative(i.filePath)),
    changelog: changelogEntries,
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const pageCount = estimatePageCount();
  console.log(`[docs-publisher] PDF regenerado: ${toPosixRelative(OUTPUT_PDF)} (${pageCount ?? '?'} página(s) aprox.)`);

  const strayAfter = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) strayAfter.push(full);
    }
  })(REPO_ROOT);
  console.log(
    strayAfter.length === 1
      ? '[docs-publisher] Confirmado: existe exatamente 1 PDF de documentação no repositório.'
      : `[docs-publisher] ATENÇÃO: encontrados ${strayAfter.length} PDFs no repositório: ${strayAfter.join(', ')}`
  );
}

main().catch((err) => {
  console.error('[docs-publisher] Falha no build:', err);
  process.exitCode = 1;
});
