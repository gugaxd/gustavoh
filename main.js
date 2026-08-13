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
    initReveals();
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
