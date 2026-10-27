/* ============================================================
   GUGA — portfólio
   A página é uma sequência. Rolar escruba a timeline.
   ============================================================ */

(function () {
  'use strict';

  var FPS = 24;
  var TOTAL_SECONDS = 96;              // 00:01:36:00 — casa com .sequence-total
  var TOTAL_FRAMES = TOTAL_SECONDS * FPS;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var compact = window.matchMedia('(max-width: 900px)');

  var clamp = function (v, min, max) { return v < min ? min : v > max ? max : v; };
  var pad = function (n, size) { return String(n).padStart(size || 2, '0'); };

  /* ── tela de carregamento ────────────────────────────────── */

  // Tiles Loader (Originkit), portado do componente React para JS puro.
  var LOADER_MIN_S = 2.5;        // duração mínima da contagem até 100%, em segundos
  var LOADER_MAX_S = 8;          // se algo travar o carregamento, segue mesmo assim
  var LOADER_REVEAL_S = 1.6;     // quadrados encolhendo e revelando o site
  var LOADER_FADE_S = 0.35;
  var LOADER_SHORT_SIDE = 7;     // quantos quadrados no lado menor da tela
  var LOADER_INK_WINDOW = 0.04;

  var seg = function (x, a, b) { return clamp((x - a) / Math.max(1e-6, b - a), 0, 1); };
  var outCubic = function (x) { return 1 - Math.pow(1 - x, 3); };
  var inOutCubic = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  // Sorteio com semente: a ordem em que os quadrados acendem é sempre a mesma.
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Curva de "carregamento" em pedaços irregulares, para a contagem não
  // subir em linha reta; chega a 1 exatamente em loadS.
  function loadCurve(seed, loadS) {
    var r = seeded(seed);
    var k = Math.min(1, loadS / 4.4);
    var chunks = [];
    var total = 0;
    for (var i = 0; i < 7; i++) {
      var size = 0.4 + r() * 1.2;
      chunks.push({ size: size, start: r() * 0.78 * loadS, len: (0.25 + r() * 0.9) * k });
      total += size;
    }
    chunks.push({ size: total * 0.12, start: loadS - 0.45 * k, len: 0.45 * k });
    total *= 1.12;
    return function (t) {
      if (t >= loadS) return 1;
      var p = 0;
      chunks.forEach(function (c) {
        var x = clamp((t - c.start) / Math.max(1e-3, c.len), 0, 1);
        p += c.size * x * x * (3 - 2 * x);
      });
      return Math.min(0.999, p / total);
    };
  }

  // Quanto da página carregou de verdade: a contagem nunca passa disso.
  function realLoad() {
    if (document.readyState === 'complete') return 1;
    var imgs = document.images;
    var done = 0;
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete) done++;
    var frac = imgs.length ? done / imgs.length : 1;
    var fonts = document.fonts && document.fonts.status === 'loaded' ? 1 : 0;
    return Math.min(0.95, 0.15 + 0.6 * frac + 0.2 * fonts);
  }

  // Chama `onReveal` quando os quadrados começam a encolher, para a abertura
  // animar enquanto aparece.
  // shortcut: a grade é calculada uma vez; se a tela girar durante os poucos
  // segundos do carregamento, os quadrados ficam do tamanho antigo.
  function initLoader(onReveal) {
    var root = document.querySelector('[data-loader]');
    if (!root || !root.offsetWidth) { onReveal(); return; }

    var countEl = root.querySelector('[data-loader-count]');
    var numEl = root.querySelector('[data-loader-num]');
    var reduced = reduceMotion.matches;

    var w = root.offsetWidth;
    var h = root.offsetHeight;
    var cell = Math.min(w, h) / LOADER_SHORT_SIDE;
    var cols = Math.max(1, Math.round(w / cell));
    var rows = Math.max(1, Math.round(h / cell));
    var count = cols * rows;

    var rand = seeded(count * 7919 + 13);
    var tiles = [];
    var papers = [];
    var order = [];
    var delay = [];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var c = i % cols;
      var r = Math.floor(i / cols);
      var tile = document.createElement('div');
      tile.className = 'loader-tile';
      tile.style.left = (c * 100 / cols) + '%';
      tile.style.top = (r * 100 / rows) + '%';
      // +1px evita frestas entre os quadrados por arredondamento.
      tile.style.width = 'calc(' + (100 / cols) + '% + 1px)';
      tile.style.height = 'calc(' + (100 / rows) + '% + 1px)';
      var paper = document.createElement('i');
      tile.appendChild(paper);
      frag.appendChild(tile);
      tiles.push(tile);
      papers.push(paper);
      order.push(rand() * (1 - LOADER_INK_WINDOW));
      // Diagonal: começa no canto de baixo à esquerda e termina no de cima à direita.
      delay.push(0.5 * (cols > 1 ? c / (cols - 1) : 0) + 0.5 * (rows > 1 ? (rows - 1 - r) / (rows - 1) : 0));
    }
    root.insertBefore(frag, countEl);
    root.classList.add('is-ready');

    var loadS = reduced ? 0.6 : Math.max(0.5, LOADER_MIN_S);
    var revealS = reduced ? 0.4 : LOADER_REVEAL_S;
    var curve = loadCurve(7, loadS);
    var t = 0;
    var progress = 0;
    var revealAt = -1;
    var last = -1;
    var shown = '';

    function draw() {
      var reveal = revealAt < 0 ? 0 : clamp((t - revealAt) / revealS, 0, 1);
      for (var i = 0; i < count; i++) {
        papers[i].style.opacity = String(1 - seg(progress, order[i], order[i] + LOADER_INK_WINDOW));
        var e = inOutCubic(seg(reveal, delay[i] * 0.55, delay[i] * 0.55 + 0.45));
        tiles[i].style.transform = 'scale(' + (1 - e) + ')';
      }
      var digits = String(Math.round(progress * 100));
      if (digits !== shown) { numEl.textContent = digits; shown = digits; }
      countEl.style.opacity = String(outCubic(seg(t, 0.1, 0.8)) * (1 - seg(reveal, 0, 0.15)));
    }

    function tick(now) {
      var dt = last < 0 ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (revealAt < 0) {
        var real = t > LOADER_MAX_S ? 1 : realLoad();
        var target = Math.min(curve(t), real);
        progress = target >= 1 ? 1 : Math.min(target, progress + dt * 1.5);
        if (progress >= 1 && t >= loadS) {
          revealAt = t;
          onReveal();
        }
      }
      draw();
      if (revealAt >= 0 && t - revealAt >= revealS) {
        root.classList.add('is-done');
        setTimeout(function () { root.remove(); }, LOADER_FADE_S * 1000);
        return;
      }
      requestAnimationFrame(tick);
    }

    draw();
    requestAnimationFrame(tick);
  }

  /* ── reveals ─────────────────────────────────────────────── */

  function initReveals() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

    requestAnimationFrame(function () {
      items.forEach(function (el) { io.observe(el); });
    });
  }

  /* ── barra de sequência ──────────────────────────────────── */

  function initSequence() {
    var bar = document.querySelector('.sequence');
    var trackEl = document.querySelector('[data-sequence-track]');
    var playhead = document.querySelector('[data-playhead]');
    var tcOut = document.querySelector('[data-timecode]');
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-clip]'));
    if (!bar || !trackEl || !sections.length) return null;

    var buttons = sections.map(function (section) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seq-clip';
      var label = section.dataset.label || section.id;
      var text = document.createElement('span');
      text.textContent = label;
      btn.appendChild(text);
      btn.setAttribute('aria-label', 'Ir para ' + label);
      btn.addEventListener('click', function () {
        section.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      });
      trackEl.appendChild(btn);
      return btn;
    });

    // Cada bloco vale o que a seção realmente ocupa no documento — a largura
    // do clipe é a duração dele. O playhead cai exatamente sobre as divisas.
    var spans = [];
    var maxScroll = 1;
    var active = -1;

    function measure() {
      var docH = document.documentElement.scrollHeight;
      maxScroll = Math.max(1, docH - window.innerHeight);

      var cursor = 0;
      spans = sections.map(function (section, i) {
        var start = i === 0 ? 0 : section.offsetTop;
        var end = i < sections.length - 1 ? sections[i + 1].offsetTop : docH;
        var share = Math.max(0.0001, (end - start) / docH);
        var span = { start: start, end: end, share: share, offset: cursor };
        cursor += share;
        return span;
      });

      // Absorve arredondamento para a soma fechar em 1.
      if (spans.length) {
        var lastSpan = spans[spans.length - 1];
        lastSpan.share = Math.max(0.0001, 1 - lastSpan.offset);
      }

      buttons.forEach(function (btn, i) {
        btn.style.flex = '0 0 ' + (spans[i].share * 100) + '%';
      });
    }

    function render() {
      var y = window.scrollY;
      var k;

      // Base = último span cujo início o scroll ainda alcança. Em telas altas
      // a última seção inteira pode caber na dobra final e nunca ter um
      // scrollTop próprio — aí quem faz o papel de cauda é a anterior.
      var i = 0;
      for (k = 0; k < spans.length; k++) {
        if (y >= spans[k].start - 1 && spans[k].start < maxScroll) i = k;
      }

      var span = spans[i];
      var tail = i === spans.length - 1 || spans[i + 1].start >= maxScroll;
      // Na cauda o playhead precisa cobrir tudo o que sobrou da barra, senão
      // trava antes do fim e o timecode nunca fecha no total.
      var end = tail ? maxScroll : span.end;
      var target = tail ? 1 : span.offset + span.share;
      var frac = clamp((y - span.start) / Math.max(1, end - span.start), 0, 1);
      var p = clamp(span.offset + frac * (target - span.offset), 0, 1);

      if (playhead) {
        playhead.style.transform = 'translate3d(' + (p * trackEl.clientWidth) + 'px,0,0)';
      }

      if (tcOut) {
        var f = Math.round(p * TOTAL_FRAMES);
        tcOut.textContent =
          pad(Math.floor(f / (3600 * FPS))) + ':' +
          pad(Math.floor(f / (60 * FPS)) % 60) + ':' +
          pad(Math.floor(f / FPS) % 60) + ':' +
          pad(f % FPS);
      }

      // O clipe aceso é aquele sob o playhead, não o do scrollTop: assim a
      // seção que só aparece na dobra final ainda acende quando ela domina a tela.
      var a = 0;
      for (k = 0; k < spans.length; k++) if (p >= spans[k].offset - 1e-6) a = k;

      if (a !== active) {
        if (buttons[active]) buttons[active].classList.remove('is-active');
        buttons[a].classList.add('is-active');
        active = a;
      }
    }

    measure();
    return { measure: measure, render: render };
  }

  /* ── copiar e-mail ───────────────────────────────────────── */

  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      var label = btn.querySelector('[data-copy-label]') || btn;
      var original = label.textContent;
      var timer;

      btn.addEventListener('click', function () {
        var value = btn.dataset.copy;
        var done = function (text) {
          label.textContent = text;
          clearTimeout(timer);
          timer = setTimeout(function () { label.textContent = original; }, 2200);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value)
            .then(function () { done('E-mail copiado'); })
            .catch(function () { done(value); });
        } else {
          done(value);
        }
      });
    });
  }

  /* ── loop ────────────────────────────────────────────────── */

  function start() {
    initLoader(initReveals);
    initCopy();

    var sequence = initSequence();
    if (!sequence) return;

    var ticking = false;

    function render() {
      ticking = false;
      sequence.render();
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(render);
    }

    function remeasure() {
      sequence.measure();
      render();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    compact.addEventListener('change', remeasure);
    reduceMotion.addEventListener('change', remeasure);

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    window.addEventListener('load', remeasure);

    remeasure();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
