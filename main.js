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

  /* ── carrossel escrubado pelo scroll ─────────────────────── */

  function initReel() {
    var reel = document.querySelector('.reel');
    var track = document.querySelector('[data-reel-track]');
    if (!reel || !track) return null;

    var clips = Array.prototype.slice.call(track.children);
    var indexOut = document.querySelector('[data-reel-index]');
    var totalOut = document.querySelector('[data-reel-total]');
    var prevBtn = document.querySelector('[data-reel-prev]');
    var nextBtn = document.querySelector('[data-reel-next]');

    if (totalOut) totalOut.textContent = pad(clips.length);

    var maxShift = 0;
    var pinned = false;

    function measure() {
      pinned = !compact.matches && !reduceMotion.matches;

      if (!pinned) {
        reel.style.height = '';
        track.style.transform = '';
        maxShift = 0;
        return;
      }

      track.style.transform = '';

      // Medida explícita: fim do último clipe + respiro direito igual ao gutter.
      var last = clips[clips.length - 1];
      var gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      var contentEnd = last ? last.offsetLeft + last.offsetWidth + gutter : 0;

      maxShift = Math.max(0, contentEnd - window.innerWidth);
      reel.style.height = (window.innerHeight + maxShift) + 'px';
    }

    function progress() {
      if (!pinned || maxShift === 0) return 0;
      var top = reel.offsetTop;
      return clamp((window.scrollY - top) / maxShift, 0, 1);
    }

    function setIndex(p) {
      if (indexOut) indexOut.textContent = pad(Math.round(p * (clips.length - 1)) + 1);
    }

    function render() {
      var p = progress();

      if (pinned) {
        track.style.transform = 'translate3d(' + (-p * maxShift) + 'px,0,0)';
        setIndex(p);
      }

      if (prevBtn) prevBtn.disabled = pinned && p <= 0.001;
      if (nextBtn) nextBtn.disabled = pinned && p >= 0.999;
    }

    // Sem pin o carrossel rola sozinho: o contador segue o scroll horizontal.
    track.addEventListener('scroll', function () {
      if (pinned) return;
      var room = track.scrollWidth - track.clientWidth;
      setIndex(room > 0 ? clamp(track.scrollLeft / room, 0, 1) : 0);
    }, { passive: true });

    function stepPx() {
      if (!clips.length) return window.innerHeight;
      var rect = clips[0].getBoundingClientRect();
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return rect.width + gap;
    }

    function nudge(dir) {
      if (pinned) {
        window.scrollBy({ top: dir * stepPx(), behavior: 'smooth' });
      } else {
        track.scrollBy({ left: dir * stepPx(), behavior: 'smooth' });
      }
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { nudge(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { nudge(1); });

    // Tab por dentro do carrossel: leva o card focado para dentro da tela.
    track.addEventListener('focusin', function (e) {
      if (!pinned) return;
      var card = e.target.closest('.clip');
      if (!card) return;
      var i = clips.indexOf(card);
      if (i < 0 || clips.length < 2) return;
      var target = reel.offsetTop + (i / (clips.length - 1)) * maxShift;
      window.scrollTo({ top: target, behavior: 'smooth' });
    });

    measure();
    return { measure: measure, render: render };
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

      var i = 0;
      for (var k = 0; k < spans.length; k++) if (y >= spans[k].start - 1) i = k;

      var span = spans[i];
      // Na última seção o scroll trava antes do fim do documento: normaliza
      // pelo que ainda dá para rolar, senão o playhead nunca chega no fim.
      var reach = i === spans.length - 1 ? maxScroll : span.end;
      var frac = clamp((y - span.start) / Math.max(1, reach - span.start), 0, 1);
      var p = clamp(span.offset + frac * span.share, 0, 1);

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

      if (i !== active) {
        if (buttons[active]) buttons[active].classList.remove('is-active');
        buttons[i].classList.add('is-active');
        active = i;
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

    var reel = initReel();
    var sequence = initSequence();
    var modules = [reel, sequence].filter(Boolean);
    if (!modules.length) return;

    var ticking = false;

    function render() {
      ticking = false;
      modules.forEach(function (m) { m.render(); });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(render);
    }

    function remeasure() {
      // ordem importa: o reel define a altura do documento que a barra mede.
      if (reel) reel.measure();
      if (sequence) sequence.measure();
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
