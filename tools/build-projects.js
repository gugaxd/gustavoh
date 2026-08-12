#!/usr/bin/env node
/* ============================================================
   Varre assets/ e regenera projects.js — a lista que o carrossel consome.

   Rode sempre que adicionar, remover ou renomear uma arte:

       node tools/build-projects.js

   O que ele preserva: name, tag e alt que você tiver editado à mão.
   O que ele recalcula: quais arquivos existem, e as dimensões de cada um.
   Arte nova entra no fim da lista; arte removida sai. A ordem do array é a
   ordem do carrossel, então reordenar ali reordena o site.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'projects.js');

const IMAGES = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
const VIDEOS = ['.mp4', '.webm', '.mov', '.m4v'];

// Marca e ícones moram em assets/ mas não são peças de portfólio.
const NOT_ARTWORK = new Set(['favicon.svg', 'gh.svg']);

/* ── leitura de dimensões, sem dependências ─────────────────── */

function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function gifSize(b) {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

function jpegSize(b) {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 carregam as dimensões.
    // DHT(c4), JPG(c8) e DAC(cc) caem na mesma faixa e não carregam.
    const isSOF = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' ||
      b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fmt = b.toString('ascii', 12, 16);
  if (fmt === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const n = b.readUInt32LE(21);
    return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function dimensions(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(131072, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    return pngSize(buf) || jpegSize(buf) || webpSize(buf) || gifSize(buf);
  } catch (err) {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/* ── curadoria já existente ─────────────────────────────────── */

function previous() {
  if (!fs.existsSync(OUT)) return new Map();
  try {
    delete require.cache[require.resolve(OUT)];
    require(OUT);
    const list = globalThis.PROJECTS;
    if (!Array.isArray(list)) return new Map();
    return new Map(list.map((p, i) => [p.file, Object.assign({ _ordem: i }, p)]));
  } catch (err) {
    console.warn('  aviso: projects.js atual não pôde ser lido (' + err.message + ')');
    return new Map();
  }
}

function nomeDeArquivo(file) {
  const base = path.basename(file, path.extname(file));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ── varredura ──────────────────────────────────────────────── */

function main() {
  if (!fs.existsSync(ASSETS)) {
    console.error('assets/ não encontrada em ' + ROOT);
    process.exit(1);
  }

  const antes = previous();

  const arquivos = fs.readdirSync(ASSETS)
    .filter((f) => !NOT_ARTWORK.has(f))
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGES.includes(ext) || VIDEOS.includes(ext);
    });

  const pecas = arquivos.map((file) => {
    const ext = path.extname(file).toLowerCase();
    const tipo = VIDEOS.includes(ext) ? 'video' : 'image';
    const full = path.join(ASSETS, file);
    const bytes = fs.statSync(full).size;
    const dim = tipo === 'image' ? dimensions(full) : null;
    const old = antes.get(file);

    return {
      _ordem: old ? old._ordem : Number.MAX_SAFE_INTEGER,
      _bytes: bytes,
      file: file,
      type: tipo,
      // Vídeo não tem dimensão lida aqui; o navegador resolve pelo metadata.
      w: dim ? dim.w : (old && old.w) || null,
      h: dim ? dim.h : (old && old.h) || null,
      name: (old && old.name) || nomeDeArquivo(file),
      tag: (old && old.tag) || '',
      alt: (old && old.alt) || ''
    };
  });

  // Conhecidas mantêm a ordem curada; novas entram no fim, em ordem alfabética.
  pecas.sort((a, b) => a._ordem - b._ordem || a.file.localeCompare(b.file, 'pt-BR'));

  const linhas = pecas.map((p) => {
    const campos = [
      'file: ' + JSON.stringify(p.file),
      'type: ' + JSON.stringify(p.type),
      'w: ' + (p.w || 'null'),
      'h: ' + (p.h || 'null'),
      'name: ' + JSON.stringify(p.name),
      'tag: ' + JSON.stringify(p.tag),
      'alt: ' + JSON.stringify(p.alt)
    ];
    return '    { ' + campos.join(', ') + ' }';
  });

  const saida = `/* ============================================================
   GERADO POR tools/build-projects.js — não edite a lista de arquivos
   à mão; rode o script depois de mexer em assets/.

       node tools/build-projects.js

   Estes campos são seus, o script preserva:
     name  título da peça no leitor de metadados
     tag   linha de apoio (função, formato, cliente…)
     alt   descrição para leitor de tela — descreva o que se vê

   A ordem deste array é a ordem do carrossel.
   ============================================================ */

(function (root) {
  root.PROJECTS = [
${linhas.join(',\n')}
  ];
})(typeof window !== 'undefined' ? window : globalThis);
`;

  fs.writeFileSync(OUT, saida);

  /* ── relatório ────────────────────────────────────────────── */

  const removidas = [...antes.keys()].filter((f) => !pecas.some((p) => p.file === f));
  const novas = pecas.filter((p) => !antes.has(p.file));
  const total = pecas.reduce((s, p) => s + p._bytes, 0);

  console.log(`\n${pecas.length} peça(s) em projects.js  ·  ${(total / 1048576).toFixed(1)} MB`);
  novas.forEach((p) => console.log('  + ' + p.file));
  removidas.forEach((f) => console.log('  - ' + f));

  const semDim = pecas.filter((p) => p.type === 'image' && !p.w);
  const semAlt = pecas.filter((p) => !p.alt);
  const pesadas = pecas.filter((p) => p._bytes > 1048576);

  if (semDim.length) console.log('\n  dimensão não lida: ' + semDim.map((p) => p.file).join(', '));
  if (semAlt.length) console.log('\n  sem alt (' + semAlt.length + '): descreva em projects.js para leitores de tela');
  if (pesadas.length) {
    console.log('\n  acima de 1 MB (' + pesadas.length + '):');
    pesadas
      .sort((a, b) => b._bytes - a._bytes)
      .forEach((p) => {
        const px = p.w ? `  ${p.w}px de largura` : '';
        console.log(`    ${(p._bytes / 1048576).toFixed(2)} MB  ${p.file}${px}`);
      });
    console.log('    o card ativo nunca passa de 760px — 1600px de largura basta');
  }
  console.log('');
}

main();
