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

  /* ── coverflow ───────────────────────────────────────────────
     Mecânica portada do componente Framer (React + framer-motion) para JS
     puro: mesma matemática de relOf / xForRel / blendForRel e o mesmo driver
     de rAF linear, sem trazer dependência nenhuma para o site estático.

     Diferença de propósito: aqui `pos` não é autônomo. Enquanto a seção está
     fixada, quem dirige é o scroll — a página continua sendo uma timeline que
     se escruba. Sem pin (celular) o driver de rAF assume, alimentado por
     arrasto, botões e clique.
     ──────────────────────────────────────────────────────────── */

  // Distância assinada do card `index` ao centro na posição `pos`, dobrada em
  // (-count/2, count/2]. A descontinuidade cai no ponto onde a opacidade já é
  // 0, então o salto não aparece e o loop é contínuo.
  function relOf(index, pos, count) {
    var rel = (((index - pos) % count) + count) % count;
    if (rel > count / 2) rel -= count;
    return rel;
  }

  // Deslocamento horizontal a partir do centro. O primeiro slot fica a meia
  // largura ativa + gap + meia lâmina; daí em diante o passo é uniforme.
  function xForRel(rel, s, gap) {
    var ar = Math.abs(rel);
    var c1 = s.activeWidth / 2 + gap + s.restWidth / 2;
    var pitch = s.restWidth + gap;
    var mag = ar <= 1 ? ar * c1 : c1 + (ar - 1) * pitch;
    return (rel < 0 ? -1 : 1) * mag;
  }

  // 0 no centro (tamanho ativo) → 1 a um slot de distância (tamanho lâmina).
  function blendForRel(rel) {
    return Math.min(Math.abs(rel), 1);
  }

  /* ── visualizador ────────────────────────────────────────────
     O palco enquadra tudo em 16:9. Aqui a peça abre na proporção que ela
     tem de verdade, declarada em data-ratio.
     ──────────────────────────────────────────────────────────── */

  var lightbox = null;

  function initLightbox() {
    var root = document.querySelector('[data-lightbox]');
    if (!root) return null;

    var panel = root.querySelector('.lb-panel');
    var media = root.querySelector('[data-lb-media]');
    var closeBtn = root.querySelector('.lb-close');
    var nameOut = root.querySelector('[data-lb-name]');
    var tagOut = root.querySelector('[data-lb-tag]');
    var fileOut = root.querySelector('[data-lb-file]');
    var ratioOut = root.querySelector('[data-lb-ratio]');

    var ratio = 16 / 9;
    var lastFocus = null;
    var prevOverflow = '';
    var prevPad = '';

    // A proporção vem do próprio arquivo — data-ratio é só o rótulo que
    // aparece na legenda, e nem toda peça tem um formato redondo para digitar.
    function ratioOf(el, rotulo) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        if (el.naturalWidth > 0 && el.naturalHeight > 0) {
          return el.naturalWidth / el.naturalHeight;
        }
      } else if (tag === 'video') {
        if (el.videoWidth > 0 && el.videoHeight > 0) {
          return el.videoWidth / el.videoHeight;
        }
      } else {
        var vb = el.getAttribute('viewBox');
        if (vb) {
          var n = vb.trim().split(/[\s,]+/).map(Number);
          if (n.length === 4 && n[2] > 0 && n[3] > 0) return n[2] / n[3];
        }
      }
      var p = String(rotulo || '').split(':');
      var a = parseFloat(p[0]);
      var b = parseFloat(p[1]);
      return a > 0 && b > 0 ? a / b : 16 / 9;
    }

    function fit() {
      var maxW = Math.min(document.documentElement.clientWidth * 0.9, 1100);
      var maxH = Math.max(160, window.innerHeight - 190);   // fecha + legenda
      var w = maxW;
      var h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      media.style.width = Math.round(w) + 'px';
      media.style.height = Math.round(h) + 'px';
    }

    function open(item) {
      // Idempotente: reabrir sem fechar gravaria 'hidden' como estado anterior
      // e o close devolveria a página travada de vez.
      if (!root.hidden) return;

      var d = item.dataset;
      var source = item.querySelector('.cf-frame').firstElementChild;
      if (!source) return;

      var clone = source.cloneNode(true);
      // No palco o SVG usa "slice" para preencher o 16:9; aqui ele precisa
      // caber inteiro, então volta para "meet".
      if (clone.tagName.toLowerCase() === 'svg') {
        clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        clone.removeAttribute('aria-hidden');
        clone.setAttribute('role', 'img');
        if (d.name) clone.setAttribute('aria-label', d.name);
      } else if (clone.tagName.toLowerCase() === 'video') {
        clone.controls = true;
        clone.autoplay = true;
        clone.muted = true;               // sem isso o autoplay é bloqueado
        clone.loop = true;
        clone.playsInline = true;
        clone.preload = 'auto';
        clone.addEventListener('loadedmetadata', function () {
          ratio = ratioOf(clone, d.ratio);
          fit();
        }, { once: true });
      } else {
        clone.removeAttribute('loading');   // já está sendo aberta agora
        // Imagem ainda não decodificada não sabe a própria proporção;
        // remede quando souber.
        clone.addEventListener('load', function () {
          ratio = ratioOf(clone, d.ratio);
          fit();
        }, { once: true });
      }

      ratio = ratioOf(clone, d.ratio);
      media.replaceChildren(clone);

      if (nameOut) nameOut.textContent = d.name || '';
      if (tagOut) tagOut.textContent = d.tag || '';
      if (fileOut) fileOut.textContent = d.file || '';
      if (ratioOut) ratioOut.textContent = d.ratio || '';

      // Trava o scroll: a página é dirigida por ele, rolar atrás do
      // visualizador escrubaria o carrossel. O padding repõe a largura que a
      // barra de rolagem deixa vaga, senão o conteúdo salta.
      var sw = window.innerWidth - document.documentElement.clientWidth;
      var html = document.documentElement;
      prevOverflow = html.style.overflow;
      prevPad = html.style.paddingRight;
      html.style.overflow = 'hidden';
      if (sw > 0) html.style.paddingRight = sw + 'px';

      lastFocus = document.activeElement;
      root.hidden = false;
      fit();
      closeBtn.focus();
    }

    function close() {
      if (root.hidden) return;
      root.hidden = true;
      media.replaceChildren();
      document.documentElement.style.overflow = prevOverflow;
      document.documentElement.style.paddingRight = prevPad;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      lastFocus = null;
    }

    root.querySelectorAll('[data-lb-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      // Fechar é o único controle focável aqui; prender o Tab evita o foco
      // escapar para a página que está travada atrás.
      else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
    });

    // Cliques dentro do painel não devem chegar ao fundo e fechar.
    panel.addEventListener('click', function (e) {
      if (!e.target.closest('[data-lb-close]')) e.stopPropagation();
    });

    window.addEventListener('resize', function () { if (!root.hidden) fit(); });

    return { open: open, close: close, isOpen: function () { return !root.hidden; } };
  }

  // Monta os cards a partir de projects.js. É essa lista que garante que o
  // número de cards seja o número de peças em assets/ — o navegador não
  // consegue enumerar uma pasta, então quem varre é tools/build-projects.js.
  function buildCards(track) {
    var list = window.PROJECTS;
    if (!Array.isArray(list) || !list.length) return 0;

    var frag = document.createDocumentFragment();

    list.forEach(function (p) {
      if (!p || !p.file) return;

      var li = document.createElement('li');
      li.className = 'cf-item';
      li.dataset.name = p.name || p.file;
      li.dataset.tag = p.tag || '';
      li.dataset.file = p.file;
      li.dataset.ratio = p.w && p.h ? p.w + ' × ' + p.h : '';

      var frame = document.createElement('div');
      frame.className = 'cf-frame';

      var media;
      if (p.type === 'video') {
        media = document.createElement('video');
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        if (p.poster) media.poster = 'assets/' + encodeURIComponent(p.poster);
      } else {
        media = document.createElement('img');
        media.loading = 'lazy';
        media.decoding = 'async';
        // Sem alt descrito, o nome da peça é melhor que nada — mas o script
        // avisa quais ainda estão sem descrição de verdade.
        media.alt = p.alt || p.name || '';
      }
      media.src = 'assets/' + encodeURIComponent(p.file);

      frame.appendChild(media);
      li.appendChild(frame);
      frag.appendChild(li);
    });

    track.replaceChildren(frag);
    return track.children.length;
  }

  function initCoverflow() {
    var reel = document.querySelector('.reel');
    var stage = document.querySelector('[data-coverflow]');
    var track = document.querySelector('[data-cf-track]');
    if (!reel || !stage || !track) return null;

    buildCards(track);

    var items = Array.prototype.slice.call(track.children);
    var count = items.length;
    if (!count) {
      // Nenhuma peça publicada: a seção fica, mas sem palco vazio pendurado.
      stage.hidden = true;
      var vazio = document.querySelector('[data-cf-name]');
      if (vazio) vazio.textContent = 'Nenhuma peça publicada ainda.';
      return null;
    }

    var indexOut = document.querySelector('[data-reel-index]');
    var totalOut = document.querySelector('[data-reel-total]');
    var prevBtn = document.querySelector('[data-reel-prev]');
    var nextBtn = document.querySelector('[data-reel-next]');
    var nameOut = document.querySelector('[data-cf-name]');
    var tagOut = document.querySelector('[data-cf-tag]');
    var fileOut = document.querySelector('[data-cf-file]');
    var ratioOut = document.querySelector('[data-cf-ratio]');

    if (totalOut) totalOut.textContent = pad(count);

    // Janela renderizada: as lâminas somem antes do ponto de dobra, então a
    // emenda do loop nunca fica visível.
    var R = Math.max(1, Math.min(6, Math.floor(count / 2) - 1));

    var sizing = { activeWidth: 0, activeHeight: 0, restWidth: 0, restHeight: 0 };
    var gap = 0;
    var stepPx = 320;
    var mode = 'flat';        // 'pinned' | 'free' | 'flat'
    var pos = 0;
    var target = 0;
    var raf = null;
    var lastT = null;
    var active = -1;

    /* ── medidas ─────────────────────────────────────────────── */

    function measure() {
      mode = reduceMotion.matches ? 'flat' : (compact.matches ? 'free' : 'pinned');

      if (mode === 'flat') {
        stage.classList.remove('is-coverflow');
        reel.style.height = '';
        items.forEach(function (el) {
          el.style.transform = '';
          el.style.opacity = '';
          el.style.zIndex = '';
          el.style.pointerEvents = '';
          var frame = el.firstElementChild;
          if (frame) { frame.style.width = ''; frame.style.height = ''; }
        });
        return;
      }

      stage.classList.add('is-coverflow');

      var w = stage.clientWidth;
      var h = stage.clientHeight;
      // Palco sem tamanho (aba em segundo plano, ancestral oculto): mantém as
      // medidas anteriores em vez de pintar cards de 0px. O ResizeObserver
      // abaixo chama de volta assim que o layout existir.
      if (w < 1 || h < 1) return;

      gap = Math.round(clamp(w * 0.018, 10, 28));

      // Card ativo em 16:9, limitado pelos dois eixos do palco.
      var aw = Math.min(w * (mode === 'free' ? 0.74 : 0.52), 760);
      var ah = aw * 9 / 16;
      var maxH = h * (mode === 'free' ? 0.86 : 0.82);
      if (ah > maxH) { ah = maxH; aw = ah * 16 / 9; }

      sizing.activeWidth = Math.round(aw);
      sizing.activeHeight = Math.round(ah);
      sizing.restWidth = Math.round(aw * 0.17);
      sizing.restHeight = Math.round(ah * 0.76);

      if (mode === 'pinned') {
        stepPx = Math.round(clamp(window.innerHeight * 0.4, 180, 340));
        reel.style.height = (window.innerHeight + stepPx * (count - 1)) + 'px';
      } else {
        reel.style.height = '';
        stepPx = sizing.restWidth + gap;
      }
    }

    /* ── pintura ─────────────────────────────────────────────── */

    function paint() {
      if (mode === 'flat') return;

      for (var i = 0; i < count; i++) {
        var el = items[i];
        var rel = relOf(i, pos, count);
        var ar = Math.abs(rel);
        var a = blendForRel(rel);

        el.style.transform = 'translate3d(' + xForRel(rel, sizing, gap) + 'px,0,0)';
        el.style.opacity = ar <= R ? 1 : ar >= R + 1 ? 0 : 1 - (ar - R);
        el.style.zIndex = Math.round(1000 - ar * 100);
        // Lâminas fora da janela não devem receber clique nem foco.
        el.style.pointerEvents = ar >= R + 1 ? 'none' : '';

        var frame = el.firstElementChild;
        if (frame) {
          frame.style.width =
            (sizing.activeWidth + (sizing.restWidth - sizing.activeWidth) * a) + 'px';
          frame.style.height =
            (sizing.activeHeight + (sizing.restHeight - sizing.activeHeight) * a) + 'px';
        }
      }

      setActive(((Math.round(pos) % count) + count) % count);

      // Só o modo fixado tem extremos: o scroll da página acaba. Solto, o
      // carrossel dá a volta, então não há nada a desabilitar.
      if (prevBtn) prevBtn.disabled = mode === 'pinned' && pos <= 0.001;
      if (nextBtn) nextBtn.disabled = mode === 'pinned' && pos >= count - 1.001;
    }

    function setActive(i) {
      if (i === active) return;
      if (items[active]) {
        items[active].removeAttribute('data-cf-active');
        items[active].tabIndex = -1;
      }
      items[i].setAttribute('data-cf-active', '');
      items[i].tabIndex = 0;
      items[i].setAttribute('role', 'button');
      items[i].setAttribute('aria-label',
        'Abrir ' + (items[i].dataset.name || 'peça') + ' em tamanho real');
      active = i;

      // Só o vídeo no centro roda; nas lâminas ele fica parado no primeiro
      // quadro, senão são seis decodificações simultâneas por nada.
      items.forEach(function (el, k) {
        var v = el.querySelector('video');
        if (!v) return;
        if (k === i && !reduceMotion.matches) {
          var play = v.play();
          if (play && play.catch) play.catch(function () {});
        } else {
          v.pause();
        }
      });

      var d = items[i].dataset;
      if (indexOut) indexOut.textContent = pad(i + 1);
      if (nameOut) nameOut.textContent = d.name || '';
      if (tagOut) tagOut.textContent = d.tag || '';
      if (fileOut) fileOut.textContent = d.file || '';
      if (ratioOut) ratioOut.textContent = d.ratio || '';
    }

    /* ── driver de rAF (só fora do modo fixado) ──────────────── */

    function tick(t) {
      var dt = Math.min((t - (lastT === null ? t : lastT)) / 1000, 1 / 30);
      lastT = t;

      var diff = target - pos;
      // Nome diferente de step() de propósito: ali é a navegação, aqui é o
      // avanço por quadro. Velocidade constante, um slot por 0,42 s.
      var avanco = (1 / 0.42) * dt;

      if (Math.abs(diff) <= avanco) {
        pos = target;
        paint();
        raf = null;
        lastT = null;
        return;
      }

      pos += (diff < 0 ? -1 : 1) * avanco;
      paint();
      raf = requestAnimationFrame(tick);
    }

    function run() {
      if (raf === null) {
        lastT = null;
        raf = requestAnimationFrame(tick);
      }
    }

    /* ── navegação ───────────────────────────────────────────── */

    function step(dir) {
      if (mode === 'pinned') {
        window.scrollBy({ top: dir * stepPx, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      } else if (mode === 'free') {
        target = Math.round(target) + dir;   // sem trava: relOf dobra o índice
        run();
      } else {
        track.scrollBy({ left: dir * (track.clientWidth * 0.8), behavior: 'smooth' });
      }
    }

    // Caminho mais curto até o card `i`, respeitando o loop.
    function goTo(i) {
      if (mode === 'pinned') {
        window.scrollTo({
          top: reel.offsetTop + i * stepPx,
          behavior: reduceMotion.matches ? 'auto' : 'smooth'
        });
      } else if (mode === 'free') {
        // Caminho mais curto até `i`, podendo passar pela emenda do loop.
        var d = (((i - target) % count) + count) % count;
        if (d > count / 2) d -= count;
        target = target + d;
        run();
      } else {
        items[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { step(1); });

    items.forEach(function (el, i) {
      el.addEventListener('click', function () {
        // Um arrasto termina em click no card sob o dedo; sem isso, soltar o
        // dedo em cima de uma lâmina dispararia uma navegação não pedida.
        if (dragged) return;
        // Lâmina: traz para o centro. Centro: abre na proporção original.
        if (mode !== 'flat' && i !== active) goTo(i);
        else if (lightbox) lightbox.open(el);
      });

      // tabindex móvel: só a peça no centro é um ponto de parada do Tab,
      // e Enter/Espaço nela fazem o mesmo que o clique.
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (lightbox) lightbox.open(el);
      });
    });

    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    /* ── arrasto (modo livre) ────────────────────────────────── */

    var dragId = null;
    var dragX = 0;
    var dragStartPos = 0;
    var dragged = false;

    stage.addEventListener('pointerdown', function (e) {
      if (mode !== 'free' || e.button !== 0) return;
      dragId = e.pointerId;
      dragX = e.clientX;
      dragStartPos = pos;
      dragged = false;
      stage.setPointerCapture(dragId);
    });

    stage.addEventListener('pointermove', function (e) {
      if (dragId !== e.pointerId) return;
      var dx = e.clientX - dragX;
      // 4px de folga para não confundir um toque trêmulo com arrasto.
      if (!dragged && Math.abs(dx) > 4) {
        dragged = true;
        stage.classList.add('is-dragging');
      }
      if (!dragged) return;
      pos = dragStartPos - dx / Math.max(1, stepPx);
      paint();
    });

    function endDrag(e) {
      if (dragId !== e.pointerId) return;
      dragId = null;
      stage.classList.remove('is-dragging');
      if (!dragged) return;
      target = Math.round(pos);
      run();
      // O click nasce depois do pointerup; libera na próxima volta do laço.
      setTimeout(function () { dragged = false; }, 0);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    /* ── modo plano: leitor segue o card mais próximo do centro ── */

    track.addEventListener('scroll', function () {
      if (mode !== 'flat') return;
      var mid = track.scrollLeft + track.clientWidth / 2;
      var best = 0;
      var bestD = Infinity;
      for (var i = 0; i < count; i++) {
        var c = items[i].offsetLeft + items[i].offsetWidth / 2;
        var d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = i; }
      }
      setActive(best);
    }, { passive: true });

    /* ── render por scroll (modo fixado) ─────────────────────── */

    function render() {
      if (mode !== 'pinned') return;
      var travel = stepPx * (count - 1);
      pos = clamp((window.scrollY - reel.offsetTop) / Math.max(1, travel), 0, 1) * (count - 1);
      paint();   // paint() também acerta o estado dos botões
    }

    function remeasure() {
      measure();
      if (mode === 'pinned') {
        render();
      } else if (mode === 'free') {
        pos = target = Math.round(pos);
        paint();
      } else if (prevBtn) {
        // Modo plano: a faixa rola nos dois sentidos, nada a desabilitar.
        prevBtn.disabled = false;
        nextBtn.disabled = false;
      }
    }

    measure();
    setActive(0);
    if (mode !== 'flat') paint();

    // O palco pode nascer sem tamanho e ganhar depois; resize da janela não
    // cobre esse caso. Os cards são absolutos dentro dele, então remedir não
    // altera o tamanho do palco e não há laço de realimentação.
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { remeasure(); }).observe(stage);
    }

    return { measure: remeasure, render: render };
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

    lightbox = initLightbox();          // antes do coverflow, que o consome
    var reel = initCoverflow();
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
