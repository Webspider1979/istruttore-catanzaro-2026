/* Istruttore Catanzaro 2026 — studio e esercitazione.
   Dati: data/domande.js, data/studio.js, data/bando.js (generati da work/js/build*.js). */
(function () {
  'use strict';

  // ------------------------------------------------------------------ dati
  var DOM = window.__DOMANDE || null;
  var STU = window.__STUDIO || null;
  var BAN = window.__BANDO || null;

  var TIPO_LABEL = { tecnica: 'Tecnica', situazionale: 'Situazionale', inglese: 'Inglese', informatica: 'Informatica' };
  var PUNTI = {
    tecnica: { ok: 1, ko: -0.33 },
    inglese: { ok: 0.5, ko: -0.165 },
    informatica: { ok: 0.5, ko: -0.165 }
  };
  var COMPOSIZIONE = [
    { tipo: 'tecnica', n: 20 },
    { tipo: 'situazionale', n: 7 },
    { tipo: 'inglese', n: 3 },
    { tipo: 'informatica', n: 3 }
  ];
  var MAX_Q = 33;

  var sezById = {}, unitaBySez = {}, qBySez = {}, domandeById = {};

  function indicizza() {
    (STU.unita || []).forEach(function (u) {
      (u.sezioni || []).forEach(function (s) { sezById[s.id] = s; unitaBySez[s.id] = u; });
    });
    (DOM.domande || []).forEach(function (q) {
      domandeById[q.id] = q;
      (qBySez[q.sr] = qBySez[q.sr] || []).push(q);
    });
  }

  // --------------------------------------------------------------- memoria
  var KEY = 'cz26.v1';
  var store = {
    prefs: { tema: 'auto', numero: 10, modo: 'bando', timer: true, priorita: true, materie: [] },
    stats: {},      // id -> {v: visti, e: errate}
    sezioniViste: {},
    sessioni: [],   // {data, n, modo, punti, max, corrette, errate, nonDate, parziali}
    quizAperto: null,
    ultimoEsito: null
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        Object.keys(store).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) store[k] = o[k]; });
      }
    } catch (e) { /* storage non disponibile: si continua in memoria */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignorato */ }
  }

  // ----------------------------------------------------------------- utili
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // <template> interpreta correttamente anche i frammenti di tabella (<tr>, <td>),
  // che un <div> scarterebbe.
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(n, dec) {
    var v = Math.round(n * Math.pow(10, dec === undefined ? 2 : dec)) / Math.pow(10, dec === undefined ? 2 : dec);
    return v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: dec === undefined ? 2 : dec });
  }
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }
  function mmss(sec) {
    var m = Math.floor(Math.max(0, sec) / 60), s = Math.max(0, sec) % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function dataIt(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  // ------------------------------------------------------------- punteggio
  function puntiDomanda(q, scelta) {
    if (scelta === null || scelta === undefined) return 0;
    if (q.t === 'situazionale') return (q.p && q.p[scelta] !== undefined) ? q.p[scelta] : 0;
    var p = PUNTI[q.t] || PUNTI.tecnica;
    return scelta === q.c ? p.ok : p.ko;
  }
  function maxDomanda(q) { return q.t === 'situazionale' ? 1 : (PUNTI[q.t] || PUNTI.tecnica).ok; }
  function esitoDomanda(q, scelta) {
    if (scelta === null || scelta === undefined) return 'none';
    if (q.t === 'situazionale') {
      var v = (q.p && q.p[scelta] !== undefined) ? q.p[scelta] : 0;
      return v === 1 ? 'ok' : (v > 0 ? 'warn' : 'bad');
    }
    return scelta === q.c ? 'ok' : 'bad';
  }

  // ----------------------------------------------- composizione del bando
  function ripartizione(n) {
    var tot = COMPOSIZIONE.reduce(function (a, c) { return a + c.n; }, 0);
    var base = COMPOSIZIONE.map(function (c) {
      var ideale = n * c.n / tot;
      return { tipo: c.tipo, q: Math.floor(ideale), resto: ideale - Math.floor(ideale) };
    });
    var assegnati = base.reduce(function (a, c) { return a + c.q; }, 0);
    var ordine = base.slice().sort(function (a, b) {
      if (b.resto !== a.resto) return b.resto - a.resto;
      return COMPOSIZIONE.findIndex(function (c) { return c.tipo === a.tipo; }) -
        COMPOSIZIONE.findIndex(function (c) { return c.tipo === b.tipo; });
    });
    var i = 0;
    while (assegnati < n && ordine.length) { ordine[i % ordine.length].q++; assegnati++; i++; }
    var out = {};
    base.forEach(function (c) { out[c.tipo] = c.q; });
    return out;
  }

  // ------------------------------------------------------------- selezione
  function candidati(filtro) {
    return (DOM.domande || []).filter(function (q) {
      if (filtro.sezione) return q.sr === filtro.sezione;
      if (filtro.unita) return (unitaBySez[q.sr] || {}).id === filtro.unita;
      if (filtro.materie && filtro.materie.length) return filtro.materie.indexOf(q.m) >= 0;
      if (filtro.tipi && filtro.tipi.length) return filtro.tipi.indexOf(q.t) >= 0;
      return true;
    });
  }
  function pesca(pool, n, priorita) {
    if (n >= pool.length) return shuffle(pool);
    if (!priorita) return shuffle(pool).slice(0, n);
    var mai = [], sbagliate = [], viste = [];
    pool.forEach(function (q) {
      var s = store.stats[q.id];
      if (!s || !s.v) mai.push(q);
      else if (s.e > 0) sbagliate.push(q);
      else viste.push(q);
    });
    var out = shuffle(mai).concat(shuffle(sbagliate), shuffle(viste));
    return out.slice(0, n);
  }

  function costruisciQuiz(cfg) {
    var scelte = [];
    if (cfg.modo === 'bando') {
      var rip = ripartizione(cfg.numero);
      Object.keys(rip).forEach(function (tipo) {
        if (!rip[tipo]) return;
        var pool = (DOM.domande || []).filter(function (q) { return q.t === tipo; });
        scelte = scelte.concat(pesca(pool, rip[tipo], cfg.priorita));
      });
      scelte = shuffle(scelte);
    } else if (cfg.modo === 'errori') {
      var pool2 = (DOM.domande || []).filter(function (q) { var s = store.stats[q.id]; return s && s.e > 0; });
      scelte = pesca(pool2, cfg.numero, false);
    } else {
      scelte = pesca(candidati(cfg.filtro || {}), cfg.numero, cfg.priorita);
    }
    var minuti = cfg.timer ? Math.max(2, Math.round(50 * scelte.length / MAX_Q)) : 0;
    return {
      cfg: cfg,
      ids: scelte.map(function (q) { return q.id; }),
      risposte: scelte.map(function () { return null; }),
      i: 0,
      inizio: Date.now(),
      secondi: minuti * 60,
      restanti: minuti * 60,
      titolo: titoloQuiz(cfg, scelte.length)
    };
  }
  function titoloQuiz(cfg, n) {
    if (cfg.modo === 'bando') return n === MAX_Q ? 'Simulazione completa della prova' : 'Simulazione ridotta (struttura del bando)';
    if (cfg.modo === 'errori') return 'Ripasso delle domande sbagliate';
    if (cfg.filtro && cfg.filtro.sezione) return 'Esercitazione: ' + ((sezById[cfg.filtro.sezione] || {}).titolo || '');
    if (cfg.filtro && cfg.filtro.unita) {
      var u = (STU.unita || []).filter(function (x) { return x.id === cfg.filtro.unita; })[0];
      return 'Esercitazione: ' + (u ? u.titolo : '');
    }
    if (cfg.filtro && cfg.filtro.materie && cfg.filtro.materie.length === 1) return 'Esercitazione: ' + cfg.filtro.materie[0];
    return 'Esercitazione libera';
  }

  // ------------------------------------------------------------------ tema
  function applicaTema() {
    var t = store.prefs.tema;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var b = $('#tema-btn');
    if (b) {
      b.textContent = t === 'auto' ? '◐' : (t === 'dark' ? '☾' : '☀');
      b.title = 'Tema: ' + (t === 'auto' ? 'automatico' : (t === 'dark' ? 'scuro' : 'chiaro'));
      b.setAttribute('aria-label', b.title);
    }
  }

  // ---------------------------------------------------------------- routing
  function vai(h) { if (location.hash === '#' + h) render(); else location.hash = '#' + h; }
  function rotta() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return { v: 'home' };
    if (h === 'studio') return { v: 'studio' };
    if (h.indexOf('studio-') === 0) return { v: 'sezione', id: h.slice(7) };
    if (h === 'esercitazione') return { v: 'setup' };
    if (h === 'quiz') return { v: 'quiz' };
    if (h === 'esito') return { v: 'esito' };
    if (h === 'andamento') return { v: 'andamento' };
    if (h === 'bando') return { v: 'bando' };
    return { v: 'home' };
  }

  function setTabs(v) {
    var mappa = { home: 'home', studio: 'studio', sezione: 'studio', setup: 'esercitazione', quiz: 'esercitazione', esito: 'esercitazione', andamento: 'andamento', bando: 'bando' };
    $$('nav.tabs a').forEach(function (a) {
      var t = a.getAttribute('data-tab');
      if (t === mappa[v]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  var timerId = null;
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function render() {
    stopTimer();
    var r = rotta();
    setTabs(r.v);
    var root = $('#view');
    root.innerHTML = '';
    if (r.v === 'home') vistaHome(root);
    else if (r.v === 'studio') vistaStudio(root);
    else if (r.v === 'sezione') vistaSezione(root, r.id);
    else if (r.v === 'setup') vistaSetup(root);
    else if (r.v === 'quiz') vistaQuiz(root);
    else if (r.v === 'esito') vistaEsito(root);
    else if (r.v === 'andamento') vistaAndamento(root);
    else if (r.v === 'bando') vistaBando(root);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ home
  function statistiche() {
    var tot = 0, vis = 0, err = 0;
    Object.keys(store.stats).forEach(function (id) {
      var s = store.stats[id];
      if (s && s.v) { vis++; tot += s.v; err += s.e || 0; }
    });
    return { domandeViste: vis, risposte: tot, errate: err };
  }
  function perMateria() {
    var m = {};
    (DOM.domande || []).forEach(function (q) {
      var s = store.stats[q.id];
      m[q.m] = m[q.m] || { tot: 0, viste: 0, risposte: 0, errate: 0 };
      m[q.m].tot++;
      if (s && s.v) { m[q.m].viste++; m[q.m].risposte += s.v; m[q.m].errate += (s.e || 0); }
    });
    return m;
  }

  function vistaHome(root) {
    var st = statistiche();
    var ultima = store.sessioni.length ? store.sessioni[store.sessioni.length - 1] : null;
    var sezTot = Object.keys(sezById).length;
    var sezViste = Object.keys(store.sezioniViste).length;
    var p = BAN.prova;

    root.appendChild(el(
      '<div class="stack">' +
      '<section class="hero">' +
      '<p class="eyebrow">' + esc(BAN.ente) + ' · ' + esc(BAN.procedura) + '</p>' +
      '<h1>' + esc(BAN.posti) + ' istruttori amministrativo-contabili</h1>' +
      '<p class="lead" style="margin-top:.4rem">Una sola prova scritta: ' + p.quesiti + ' quesiti a risposta multipla in ' + p.minuti +
      ' minuti, su 30 punti complessivi. Si supera con ' + esc(p.soglia) + '.</p>' +
      '<div class="row" style="margin-top:.9rem">' +
      '<a class="btn btn-primary btn-lg" href="#esercitazione">Inizia un\'esercitazione</a>' +
      '<a class="btn" href="#studio">Vai allo studio</a>' +
      '</div>' +
      '</section>' +

      '<section class="stack-s">' +
      '<h2>Com\'è fatta la prova</h2>' +
      '<div class="exam-strip">' +
      p.composizione.map(function (c) {
        return '<div class="b"><b>' + c.numero + '</b><span>' + esc(c.etichetta) + '</span>' +
          '<span class="mono" style="font-size:.74rem">' + esc(c.regola) + '</span></div>';
      }).join('') +
      '</div>' +
      '<p class="small muted">' + esc(p.nota_banca_dati) + ' I quesiti di questa app sono esercizi originali costruiti sulle fonti vigenti.</p>' +
      '</section>' +

      '<section class="stack-s">' +
      '<h2>Dove sei arrivato</h2>' +
      '<div class="grid g-4">' +
      '<div class="tile"><div class="k">Paniere</div><div class="v">' + DOM.totale + '</div><div class="n">quesiti disponibili</div></div>' +
      '<div class="tile"><div class="k">Domande affrontate</div><div class="v">' + st.domandeViste + '</div><div class="n">su ' + DOM.totale + '</div></div>' +
      '<div class="tile"><div class="k">Schede di studio aperte</div><div class="v">' + sezViste + '</div><div class="n">su ' + sezTot + '</div></div>' +
      '<div class="tile"><div class="k">Sessioni svolte</div><div class="v">' + store.sessioni.length + '</div><div class="n">' +
      (ultima ? 'ultima: ' + num(ultima.punti) + '/' + num(ultima.max) : 'nessuna ancora') + '</div></div>' +
      '</div>' +
      '</section>' +
      '</div>'
    ));

    // scorciatoie
    var box = el('<section class="stack-s"><h2>Scorciatoie</h2><div class="grid g-2"></div></section>');
    var g = $('.grid', box);
    g.appendChild(el('<a class="card link" href="#esercitazione"><b>Simulazione completa</b>' +
      '<p class="small muted" style="margin-top:.25rem">33 quesiti, 50 minuti, composizione e punteggi del bando.</p></a>'));
    var nErr = (DOM.domande || []).filter(function (q) { var s = store.stats[q.id]; return s && s.e > 0; }).length;
    g.appendChild(el('<a class="card link" href="#esercitazione"><b>Ripasso degli errori</b>' +
      '<p class="small muted" style="margin-top:.25rem">' + (nErr ? nErr + ' domande sbagliate in passato, da rifare.' : 'Nessun errore registrato per ora.') + '</p></a>'));
    g.appendChild(el('<a class="card link" href="#studio"><b>14 unità di studio</b>' +
      '<p class="small muted" style="margin-top:.25rem">' + sezTot + ' schede con punti cardine e riferimenti normativi.</p></a>'));
    g.appendChild(el('<a class="card link" href="#bando"><b>Dati del bando</b>' +
      '<p class="small muted" style="margin-top:.25rem">Requisiti, domanda su inPA, materie, punteggi e avvertenze.</p></a>'));
    root.appendChild(box);

    if (store.quizAperto && store.quizAperto.ids && store.quizAperto.ids.length) {
      var q = store.quizAperto;
      var fatte = q.risposte.filter(function (x) { return x !== null; }).length;
      var n = el('<div class="notice">Hai una sessione interrotta: <b>' + esc(q.titolo) + '</b> — ' + fatte + '/' + q.ids.length +
        ' risposte. <a href="#quiz">Riprendi</a> oppure <button class="btn btn-ghost" id="scarta" type="button">scarta</button></div>');
      $('#scarta', n).addEventListener('click', function () { store.quizAperto = null; save(); render(); });
      root.insertBefore(n, root.firstChild);
    }
  }

  // ---------------------------------------------------------------- studio
  function vistaStudio(root) {
    var head = el('<div class="stack">' +
      '<div><p class="eyebrow">Studio</p><h1>Programma in 14 unità</h1>' +
      '<p class="lead" style="margin-top:.35rem">Ogni unità è divisa in schede. Ogni scheda ha i punti cardine, i riferimenti normativi e le domande collegate: da lì puoi esercitarti solo su quell\'argomento.</p></div>' +
      '<input class="searchbox" id="cerca" type="search" placeholder="Cerca un argomento (per esempio: soglie, silenzio assenso, FCDE, peculato)" autocomplete="off">' +
      '<div id="unita" class="stack"></div>' +
      '</div>');
    root.appendChild(head);
    var cont = $('#unita', head);

    function disegna(filtro) {
      cont.innerHTML = '';
      var f = (filtro || '').trim().toLowerCase();
      var trovati = 0;
      (STU.unita || []).forEach(function (u) {
        var sez = (u.sezioni || []).filter(function (s) {
          if (!f) return true;
          var testo = (s.titolo + ' ' + s.punti.join(' ') + ' ' + s.corpo.join(' ') + ' ' + (s.fonti || []).join(' ')).toLowerCase();
          return testo.indexOf(f) >= 0 || u.titolo.toLowerCase().indexOf(f) >= 0;
        });
        if (!sez.length) return;
        trovati += sez.length;
        var nQ = (u.sezioni || []).reduce(function (a, s) { return a + ((qBySez[s.id] || []).length); }, 0);
        var card = el('<section class="card">' +
          '<div class="unit-head"><span class="unit-num">U' + u.numero + '</span>' +
          '<div style="min-width:0"><h2 style="font-size:1.2rem">' + esc(u.titolo) + '</h2>' +
          '<p class="small muted" style="margin-top:.2rem">' + esc(u.materia) + ' · ' + nQ + ' quesiti collegati</p></div></div>' +
          '<ul class="sec-list"></ul>' +
          '<div class="row" style="margin-top:.7rem"><a class="btn btn-ghost small" href="#esercitazione" data-unita="' + esc(u.id) + '">Esercitati su tutta l\'unità →</a></div>' +
          '</section>');
        var ul = $('.sec-list', card);
        sez.forEach(function (s) {
          var n = (qBySez[s.id] || []).length;
          ul.appendChild(el('<li><a href="#studio-' + esc(s.id) + '">' +
            '<span style="display:flex;gap:.5rem;align-items:center;min-width:0">' +
            (store.sezioniViste[s.id] ? '<i class="done-dot" title="già aperta"></i>' : '') +
            '<span>' + esc(s.titolo) + '</span></span>' +
            '<span class="q">' + n + '</span></a></li>'));
        });
        $('[data-unita]', card).addEventListener('click', function () {
          store.prefs.modo = 'libera';
          store.prefs.filtroUnita = u.id;
          store.prefs.filtroSezione = null;
          save();
        });
        cont.appendChild(card);
      });
      if (!trovati) cont.appendChild(el('<p class="muted">Nessuna scheda corrisponde a questa ricerca.</p>'));
    }
    disegna('');
    $('#cerca', head).addEventListener('input', function (e) { disegna(e.target.value); });
  }

  function vistaSezione(root, id) {
    var s = sezById[id];
    if (!s) { root.appendChild(el('<p class="muted">Scheda non trovata. <a href="#studio">Torna allo studio</a>.</p>')); return; }
    var u = unitaBySez[id];
    store.sezioniViste[id] = Date.now();
    save();

    var idx = u.sezioni.findIndex(function (x) { return x.id === id; });
    var prev = idx > 0 ? u.sezioni[idx - 1] : null;
    var next = idx < u.sezioni.length - 1 ? u.sezioni[idx + 1] : null;
    var qs = qBySez[id] || [];

    var w = el('<div class="stack col-read">' +
      '<div><p class="eyebrow"><a href="#studio" style="text-decoration:none">Studio</a> · Unità ' + u.numero + ' — ' + esc(u.titolo) + '</p>' +
      '<h1>' + esc(s.titolo) + '</h1></div>' +
      (idx === 0 ? '<p class="lead">' + esc(u.intro) + '</p>' : '') +
      '<div class="prose">' + s.corpo.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      '<div class="keybox"><p class="eyebrow">Punti cardine</p><ul>' +
      s.punti.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' +
      (s.fonti && s.fonti.length ? '<div class="srcbox"><p class="eyebrow">Riferimenti</p><ul>' +
        s.fonti.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<hr class="sep">' +
      '<div class="row">' +
      (qs.length ? '<button class="btn btn-primary" id="allenati" type="button">Allenati su questo argomento (' + qs.length + ' quesiti)</button>' : '<span class="muted small">Nessun quesito collegato a questa scheda.</span>') +
      '<a class="btn btn-ghost" href="#studio">Indice dello studio</a>' +
      '</div>' +
      '<div class="sec-nav">' +
      (prev ? '<a class="btn" href="#studio-' + esc(prev.id) + '">← ' + esc(prev.titolo) + '</a>' : '<span></span>') +
      (next ? '<a class="btn" href="#studio-' + esc(next.id) + '">' + esc(next.titolo) + ' →</a>' : '<span></span>') +
      '</div>' +
      '</div>');
    root.appendChild(w);

    if (qs.length) {
      $('#allenati', w).addEventListener('click', function () {
        store.prefs.modo = 'libera';
        store.prefs.filtroSezione = id;
        store.prefs.filtroUnita = null;
        store.prefs.numero = Math.min(MAX_Q, Math.max(1, Math.min(qs.length, 10)));
        save();
        vai('esercitazione');
      });
    }
  }

  // ------------------------------------------------------------ setup quiz
  function vistaSetup(root) {
    var p = store.prefs;
    if (p.numero == null) p.numero = 10;
    var materieTutte = Object.keys(DOM.materie).sort();
    var nErr = (DOM.domande || []).filter(function (q) { var s = store.stats[q.id]; return s && s.e > 0; }).length;

    var w = el('<div class="stack col-read">' +
      '<div><p class="eyebrow">Esercitazione</p><h1>Prepara la sessione</h1>' +
      '<p class="lead" style="margin-top:.35rem">Scegli quante domande vuoi, da 1 a ' + MAX_Q + ', e come selezionarle. Il punteggio segue sempre le regole del bando.</p></div>' +

      '<section class="card stack-s">' +
      '<div class="setup-field"><label for="n-range">Numero di domande</label>' +
      '<div class="numwrap">' +
      '<span class="numbig" id="n-view">' + p.numero + '</span>' +
      '<input id="n-range" type="range" min="1" max="' + MAX_Q + '" step="1" value="' + p.numero + '" aria-label="Numero di domande">' +
      '<input id="n-input" class="mono" type="number" min="1" max="' + MAX_Q + '" value="' + p.numero + '" style="width:5rem;padding:.4rem .5rem;border:1px solid var(--line);border-radius:var(--r-s);background:var(--surface);color:var(--ink);font:inherit" aria-label="Numero di domande (valore)">' +
      '</div>' +
      '<div class="chips" id="n-chips">' +
      [1, 5, 10, 15, 20, 33].map(function (v) { return '<button class="chip" type="button" data-n="' + v + '" aria-pressed="false">' + v + '</button>'; }).join('') +
      '</div>' +
      '<p class="small muted" id="n-nota"></p>' +
      '</div>' +
      '</section>' +

      '<section class="stack-s"><h2 style="font-size:1.1rem">Come scegliere le domande</h2>' +
      '<div class="modes" id="modes">' +
      '<label class="mode"><input type="radio" name="modo" value="bando"><span><b>Struttura del bando</b>' +
      '<span>Mantiene le proporzioni della prova: tecniche, situazionali, inglese e informatica. A 33 domande è la simulazione completa (20 + 7 + 3 + 3).</span></span></label>' +
      '<label class="mode"><input type="radio" name="modo" value="libera"><span><b>Scelta libera</b>' +
      '<span>Tutte le materie, oppure solo quelle che selezioni. Utile per lavorare su un argomento alla volta.</span></span></label>' +
      '<label class="mode"><input type="radio" name="modo" value="errori"><span><b>Solo i miei errori</b>' +
      '<span>' + (nErr ? 'Ripesca le ' + nErr + ' domande che hai sbagliato nelle sessioni precedenti.' : 'Disponibile dopo la prima sessione con almeno un errore.') + '</span></span></label>' +
      '</div>' +
      '<div id="filtri"></div>' +
      '</section>' +

      '<section class="card stack-s">' +
      '<label class="row" style="gap:.5rem"><input type="checkbox" id="timer" style="accent-color:var(--accent)">' +
      '<span><b>Tempo limitato</b> <span class="small muted">— proporzionale alla prova reale: 50 minuti per 33 domande.</span></span></label>' +
      '<label class="row" style="gap:.5rem"><input type="checkbox" id="priorita" style="accent-color:var(--accent)">' +
      '<span><b>Priorità alle domande nuove</b> <span class="small muted">— prima quelle mai viste, poi quelle sbagliate, poi le altre.</span></span></label>' +
      '</section>' +

      '<div class="row"><button class="btn btn-primary btn-lg" id="start" type="button">Avvia la sessione</button>' +
      '<a class="btn btn-ghost" href="#home">Annulla</a></div>' +
      '</div>');
    root.appendChild(w);

    var rng = $('#n-range', w), inp = $('#n-input', w), view = $('#n-view', w), nota = $('#n-nota', w);
    $('#timer', w).checked = !!p.timer;
    $('#priorita', w).checked = p.priorita !== false;
    $$('input[name=modo]', w).forEach(function (r) { r.checked = (r.value === (p.modo || 'bando')); });
    if (!nErr && p.modo === 'errori') { p.modo = 'bando'; $$('input[name=modo]', w)[0].checked = true; }
    $$('input[name=modo]', w)[2].disabled = !nErr;

    function disponibili() {
      var modo = modoSel();
      if (modo === 'errori') return nErr;
      if (modo === 'bando') return DOM.totale;
      return candidati(filtroCorrente()).length;
    }
    function modoSel() {
      var r = $$('input[name=modo]', w).filter(function (x) { return x.checked; })[0];
      return r ? r.value : 'bando';
    }
    function filtroCorrente() {
      if (p.filtroSezione) return { sezione: p.filtroSezione };
      if (p.filtroUnita) return { unita: p.filtroUnita };
      var sel = $$('#filtri input[data-mat]', w).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-mat'); });
      return sel.length && sel.length < materieTutte.length ? { materie: sel } : {};
    }

    function aggiornaNumero(v) {
      v = Math.max(1, Math.min(MAX_Q, parseInt(v, 10) || 1));
      p.numero = v;
      rng.value = v; inp.value = v; view.textContent = v;
      $$('#n-chips .chip', w).forEach(function (c) { c.setAttribute('aria-pressed', String(parseInt(c.getAttribute('data-n'), 10) === v)); });
      var disp = disponibili();
      var righe = [];
      if (modoSel() === 'bando') {
        var rip = ripartizione(v);
        righe.push('Composizione: ' + Object.keys(rip).filter(function (k) { return rip[k]; })
          .map(function (k) { return rip[k] + ' ' + TIPO_LABEL[k].toLowerCase(); }).join(' · '));
        righe.push('Punteggio massimo: ' + num(puntiMassimiRip(rip)) + ' punti' + (v === MAX_Q ? ' · soglia della prova 21/30' : ''));
      } else {
        righe.push('Domande disponibili con questi criteri: ' + disp + (v > disp ? ' — la sessione ne userà ' + disp : ''));
      }
      if ($('#timer', w).checked) righe.push('Tempo: ' + Math.max(2, Math.round(50 * Math.min(v, disp) / MAX_Q)) + ' minuti');
      nota.innerHTML = righe.map(esc).join('<br>');
      $('#start', w).disabled = disp === 0;
      save();
    }
    function puntiMassimiRip(rip) {
      var t = 0;
      Object.keys(rip).forEach(function (k) { t += rip[k] * (k === 'situazionale' ? 1 : PUNTI[k].ok); });
      return t;
    }

    function disegnaFiltri() {
      var box = $('#filtri', w);
      box.innerHTML = '';
      $$('.mode', w).forEach(function (m) { m.classList.toggle('on', $('input', m).checked); });
      if (modoSel() !== 'libera') { aggiornaNumero(p.numero); return; }
      if (p.filtroSezione && sezById[p.filtroSezione]) {
        var s = sezById[p.filtroSezione];
        var c = el('<div class="card card-pad-s row" style="justify-content:space-between">' +
          '<span class="small">Argomento: <b>' + esc(s.titolo) + '</b> <span class="muted">(' + (qBySez[s.id] || []).length + ' quesiti)</span></span>' +
          '<button class="btn btn-ghost small" type="button" id="togli">Tutte le materie</button></div>');
        $('#togli', c).addEventListener('click', function () { p.filtroSezione = null; p.filtroUnita = null; save(); disegnaFiltri(); });
        box.appendChild(c);
      } else if (p.filtroUnita) {
        var u = (STU.unita || []).filter(function (x) { return x.id === p.filtroUnita; })[0];
        var c2 = el('<div class="card card-pad-s row" style="justify-content:space-between">' +
          '<span class="small">Unità: <b>' + esc(u ? u.titolo : '') + '</b></span>' +
          '<button class="btn btn-ghost small" type="button" id="togli2">Tutte le materie</button></div>');
        $('#togli2', c2).addEventListener('click', function () { p.filtroUnita = null; save(); disegnaFiltri(); });
        box.appendChild(c2);
      } else {
        var sel = p.materie || [];
        var c3 = el('<div class="card stack-s"><p class="eyebrow">Materie (nessuna selezione = tutte)</p><div class="matlist"></div>' +
          '<div class="row"><button class="btn btn-ghost small" type="button" id="none">Deseleziona tutte</button></div></div>');
        var list = $('.matlist', c3);
        materieTutte.forEach(function (m) {
          var lab = el('<label><input type="checkbox" data-mat="' + esc(m) + '"' + (sel.indexOf(m) >= 0 ? ' checked' : '') + '>' +
            '<span>' + esc(m) + '</span><span class="q">' + DOM.materie[m] + '</span></label>');
          $('input', lab).addEventListener('change', function () {
            p.materie = $$('#filtri input[data-mat]', w).filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-mat'); });
            save(); aggiornaNumero(p.numero);
          });
          list.appendChild(lab);
        });
        $('#none', c3).addEventListener('click', function () { p.materie = []; save(); disegnaFiltri(); });
        box.appendChild(c3);
      }
      aggiornaNumero(p.numero);
    }

    rng.addEventListener('input', function () { aggiornaNumero(rng.value); });
    inp.addEventListener('change', function () { aggiornaNumero(inp.value); });
    $$('#n-chips .chip', w).forEach(function (c) {
      c.addEventListener('click', function () { aggiornaNumero(c.getAttribute('data-n')); });
    });
    $$('input[name=modo]', w).forEach(function (r) {
      r.addEventListener('change', function () { p.modo = r.value; save(); disegnaFiltri(); });
    });
    $('#timer', w).addEventListener('change', function () { p.timer = $('#timer', w).checked; save(); aggiornaNumero(p.numero); });
    $('#priorita', w).addEventListener('change', function () { p.priorita = $('#priorita', w).checked; save(); });

    $('#start', w).addEventListener('click', function () {
      var cfg = {
        modo: modoSel(),
        numero: p.numero,
        timer: $('#timer', w).checked,
        priorita: $('#priorita', w).checked,
        filtro: modoSel() === 'libera' ? filtroCorrente() : {}
      };
      var q = costruisciQuiz(cfg);
      if (!q.ids.length) return;
      store.quizAperto = q;
      store.ultimoEsito = null;
      save();
      vai('quiz');
    });

    disegnaFiltri();
  }

  // ------------------------------------------------------------------ quiz
  function vistaQuiz(root) {
    var q = store.quizAperto;
    if (!q || !q.ids || !q.ids.length) {
      root.appendChild(el('<div class="stack col-read"><h1>Nessuna sessione attiva</h1>' +
        '<p class="lead">Scegli numero di domande e criteri, poi avvia la sessione.</p>' +
        '<div class="row"><a class="btn btn-primary" href="#esercitazione">Prepara una sessione</a></div></div>'));
      return;
    }

    var w = el('<div class="stack">' +
      '<div class="quizbar">' +
      '<div style="min-width:0"><p class="eyebrow">' + esc(q.titolo) + '</p>' +
      '<div class="small muted"><span id="pos"></span> · <span id="fatte"></span></div></div>' +
      '<div class="row" style="gap:.6rem">' +
      '<span class="timer" id="timer-view"' + (q.secondi ? '' : ' hidden') + '></span>' +
      '<button class="btn" id="chiudi" type="button">Termina e correggi</button>' +
      '</div>' +
      '</div>' +
      '<div class="progressline"><i id="pl" style="width:0%"></i></div>' +
      '<div id="qbox" class="col-read" style="width:100%"></div>' +
      '<div class="stack-s"><p class="eyebrow">Domande</p><div class="palette" id="pal"></div></div>' +
      '</div>');
    root.appendChild(w);

    function disegna() {
      var d = domandeById[q.ids[q.i]];
      var box = $('#qbox', w);
      box.innerHTML = '';
      var sez = sezById[d.sr];
      var card = el('<div class="qcard">' +
        '<div class="row" style="gap:.4rem;margin-bottom:.7rem">' +
        '<span class="pill t-' + esc(d.t) + '">' + esc(TIPO_LABEL[d.t]) + '</span>' +
        '<span class="pill">' + esc(d.m) + '</span>' +
        '<span class="pill">' + esc(d.s) + '</span>' +
        '</div>' +
        '<p class="qtext">' + esc(d.q) + '</p>' +
        '<div class="opts"></div>' +
        '<div class="row" style="margin-top:1rem;justify-content:space-between">' +
        '<div class="row" style="gap:.4rem">' +
        '<button class="btn" id="prev" type="button"' + (q.i === 0 ? ' disabled' : '') + '>← Precedente</button>' +
        '<button class="btn" id="next" type="button">' + (q.i === q.ids.length - 1 ? 'Ultima' : 'Successiva →') + '</button>' +
        '</div>' +
        '<button class="btn btn-ghost" id="salta" type="button">Non rispondo</button>' +
        '</div>' +
        '</div>');
      var opts = $('.opts', card);
      d.o.forEach(function (testo, k) {
        var b = el('<button class="opt" type="button" aria-pressed="' + (q.risposte[q.i] === k ? 'true' : 'false') + '">' +
          '<span class="l">' + 'ABCD'[k] + '</span><span>' + esc(testo) + '</span></button>');
        b.addEventListener('click', function () {
          q.risposte[q.i] = (q.risposte[q.i] === k) ? null : k;
          save();
          if (q.risposte[q.i] !== null && q.i < q.ids.length - 1) { q.i++; save(); disegna(); }
          else disegna();
        });
        opts.appendChild(b);
      });
      box.appendChild(card);
      if (sez) box.appendChild(el('<p class="small muted" style="margin-top:.5rem">Argomento di studio collegato: <a href="#studio-' + esc(d.sr) + '">' + esc(sez.titolo) + '</a></p>'));

      $('#prev', card).addEventListener('click', function () { if (q.i > 0) { q.i--; save(); disegna(); } });
      $('#next', card).addEventListener('click', function () {
        if (q.i < q.ids.length - 1) { q.i++; save(); disegna(); } else chiudi();
      });
      $('#salta', card).addEventListener('click', function () {
        q.risposte[q.i] = null; save();
        if (q.i < q.ids.length - 1) { q.i++; save(); }
        disegna();
      });

      var fatte = q.risposte.filter(function (x) { return x !== null; }).length;
      $('#pos', w).textContent = 'Domanda ' + (q.i + 1) + ' di ' + q.ids.length;
      $('#fatte', w).textContent = fatte + ' risposte date';
      $('#pl', w).style.width = Math.round(100 * (q.i + 1) / q.ids.length) + '%';

      var pal = $('#pal', w);
      pal.innerHTML = '';
      q.ids.forEach(function (id, k) {
        var b = el('<button type="button" class="' + (q.risposte[k] !== null ? 'ans' : '') + (k === q.i ? ' cur' : '') + '" aria-label="Vai alla domanda ' + (k + 1) + '">' + (k + 1) + '</button>');
        b.addEventListener('click', function () { q.i = k; save(); disegna(); });
        pal.appendChild(b);
      });
    }

    function chiudi() { stopTimer(); correggi(); }

    $('#chiudi', w).addEventListener('click', chiudi);
    disegna();

    if (q.secondi) {
      var tv = $('#timer-view', w);
      function tick() {
        tv.textContent = mmss(q.restanti);
        tv.classList.toggle('low', q.restanti <= 60);
        if (q.restanti <= 0) { stopTimer(); correggi(); return; }
        q.restanti--;
      }
      tick();
      timerId = setInterval(function () { tick(); if (q.restanti % 10 === 0) save(); }, 1000);
    }
  }

  // ----------------------------------------------------------------- esito
  function correggi() {
    var q = store.quizAperto;
    if (!q) return;
    var dettaglio = q.ids.map(function (id, k) {
      var d = domandeById[id];
      var scelta = q.risposte[k];
      return { id: id, scelta: scelta, punti: puntiDomanda(d, scelta), max: maxDomanda(d), esito: esitoDomanda(d, scelta) };
    });
    var punti = dettaglio.reduce(function (a, r) { return a + r.punti; }, 0);
    var max = dettaglio.reduce(function (a, r) { return a + r.max; }, 0);
    var conta = { ok: 0, warn: 0, bad: 0, none: 0 };
    dettaglio.forEach(function (r) { conta[r.esito]++; });

    dettaglio.forEach(function (r) {
      var s = store.stats[r.id] || { v: 0, e: 0 };
      s.v++;
      if (r.esito === 'bad') s.e++;
      else if (r.esito === 'ok' && s.e > 0) s.e--;
      store.stats[r.id] = s;
    });

    var sessione = {
      data: Date.now(), titolo: q.titolo, modo: q.cfg.modo, n: q.ids.length,
      punti: punti, max: max, ok: conta.ok, warn: conta.warn, bad: conta.bad, none: conta.none,
      durata: Math.round((Date.now() - q.inizio) / 1000),
      simulazione: q.cfg.modo === 'bando' && q.ids.length === MAX_Q
    };
    store.sessioni.push(sessione);
    if (store.sessioni.length > 100) store.sessioni = store.sessioni.slice(-100);
    store.ultimoEsito = { sessione: sessione, dettaglio: dettaglio, cfg: q.cfg };
    store.quizAperto = null;
    save();
    vai('esito');
  }

  function vistaEsito(root) {
    var e = store.ultimoEsito;
    if (!e) {
      root.appendChild(el('<div class="stack col-read"><h1>Nessun resoconto</h1>' +
        '<p class="lead">Completa una sessione per vedere il riepilogo.</p>' +
        '<div class="row"><a class="btn btn-primary" href="#esercitazione">Prepara una sessione</a></div></div>'));
      return;
    }
    var s = e.sessione;
    var pass = s.simulazione ? (s.punti >= 21) : null;
    var perc = s.max > 0 ? Math.round(100 * Math.max(0, s.punti) / s.max) : 0;

    var w = el('<div class="stack">' +
      '<div><p class="eyebrow">Resoconto · ' + esc(dataIt(s.data)) + '</p><h1>' + esc(s.titolo) + '</h1></div>' +
      '<div class="score-hero">' +
      '<div class="score-big ' + (pass === null ? '' : (pass ? 'pass' : 'fail')) + '">' +
      '<div class="n">' + num(s.punti) + '</div>' +
      '<div class="d">su ' + num(s.max) + ' punti · ' + perc + '%</div>' +
      (pass === null ? '' : '<p style="margin-top:.5rem"><span class="pill ' + (pass ? 'ok' : 'bad') + '">' +
        (pass ? 'Sopra la soglia di 21/30' : 'Sotto la soglia di 21/30') + '</span></p>') +
      '</div>' +
      '<div class="stack-s">' +
      '<div class="bar">' +
      ['ok', 'warn', 'bad', 'none'].map(function (k) {
        return s[k] ? '<i class="' + k + '" style="width:' + (100 * s[k] / s.n) + '%"></i>' : '';
      }).join('') +
      '</div>' +
      '<div class="grid g-4">' +
      '<div class="tile"><div class="k">Corrette</div><div class="v" style="color:var(--ok)">' + s.ok + '</div><div class="n">su ' + s.n + ' domande</div></div>' +
      (s.warn ? '<div class="tile"><div class="k">Parziali</div><div class="v" style="color:var(--warn)">' + s.warn + '</div><div class="n">situazionali da 0,50</div></div>' : '') +
      '<div class="tile"><div class="k">Errate</div><div class="v" style="color:var(--bad)">' + s.bad + '</div><div class="n">da ripassare</div></div>' +
      '<div class="tile"><div class="k">Non date</div><div class="v">' + s.none + '</div><div class="n">nessuna penalità</div></div>' +
      '</div>' +
      '<p class="small muted">Tempo impiegato: ' + mmss(s.durata) + '. Punteggi applicati: tecniche +1 / −0,33, inglese e informatica +0,50 / −0,165, situazionali 1 / 0,50 / 0.</p>' +
      '</div>' +
      '</div>' +
      '<div class="row">' +
      '<a class="btn btn-primary" href="#esercitazione">Nuova sessione</a>' +
      '<button class="btn" id="rifai" type="button">Rifai solo le sbagliate</button>' +
      '<a class="btn btn-ghost" href="#andamento">Andamento</a>' +
      '</div>' +
      '<div id="errate"></div>' +
      '<div id="corrette"></div>' +
      '</div>');
    root.appendChild(w);

    var daRipassare = e.dettaglio.filter(function (r) { return r.esito === 'bad' || r.esito === 'none' || r.esito === 'warn'; });
    var giuste = e.dettaglio.filter(function (r) { return r.esito === 'ok'; });

    var box = $('#errate', w);
    if (daRipassare.length) {
      box.appendChild(el('<h2 style="margin-bottom:.6rem">Da rivedere (' + daRipassare.length + ')</h2>'));
      var rev = el('<div class="review"></div>');
      daRipassare.forEach(function (r) { rev.appendChild(schedaRevisione(r)); });
      box.appendChild(rev);
    } else {
      box.appendChild(el('<div class="card" style="border-color:var(--ok)"><b>Tutte corrette.</b> ' +
        '<span class="muted">Nessun argomento da ripassare in questa sessione.</span></div>'));
    }

    if (giuste.length) {
      var det = el('<details class="okbox card" style="margin-top:1rem"><summary>Risposte corrette (' + giuste.length + ')</summary><div class="review"></div></details>');
      giuste.forEach(function (r) { $('.review', det).appendChild(schedaRevisione(r)); });
      $('#corrette', w).appendChild(det);
    }

    $('#rifai', w).addEventListener('click', function () {
      var ids = e.dettaglio.filter(function (r) { return r.esito === 'bad' || r.esito === 'warn' || r.esito === 'none'; })
        .map(function (r) { return r.id; });
      if (!ids.length) return;
      store.quizAperto = {
        cfg: { modo: 'ripasso', numero: ids.length, timer: false, priorita: false, filtro: {} },
        ids: shuffle(ids), risposte: ids.map(function () { return null; }),
        i: 0, inizio: Date.now(), secondi: 0, restanti: 0,
        titolo: 'Ripasso delle domande di questa sessione'
      };
      store.ultimoEsito = null;
      save();
      vai('quiz');
    });
  }

  function schedaRevisione(r) {
    var d = domandeById[r.id];
    var sez = sezById[d.sr];
    var u = unitaBySez[d.sr];
    var fonte = (DOM.fonti || {})[d.f] || {};
    var tua = r.scelta === null || r.scelta === undefined ? null : r.scelta;
    var cls = r.esito;

    var html = '<article class="rev ' + cls + '">' +
      '<div class="row" style="gap:.4rem;margin-bottom:.5rem">' +
      '<span class="pill ' + (cls === 'ok' ? 'ok' : (cls === 'warn' ? 'warn' : (cls === 'bad' ? 'bad' : ''))) + '">' +
      (cls === 'ok' ? 'Corretta' : cls === 'warn' ? 'Parziale · 0,50' : cls === 'bad' ? 'Errata' : 'Non data') + '</span>' +
      '<span class="pill t-' + esc(d.t) + '">' + esc(TIPO_LABEL[d.t]) + '</span>' +
      '<span class="pill">' + esc(d.m) + '</span>' +
      '<span class="pill mono">' + (r.punti > 0 ? '+' : '') + num(r.punti) + '</span>' +
      '</div>' +
      '<p><b>' + esc(d.q) + '</b></p>' +
      '<div class="ans">';

    var NESSUNA = '<i class="muted">nessuna risposta</i>';
    if (d.t === 'situazionale') {
      var tuaTxt = NESSUNA;
      if (tua !== null) {
        tuaTxt = esc('ABCD'[tua] + ') ' + d.o[tua]) + ' <span class="muted">(' + num(d.p[tua]) + ' punti)</span>';
      }
      html += '<div><span class="k">Tua scelta</span><span>' + tuaTxt + '</span></div>';
      html += '<div><span class="k">Più efficace</span><span>' + esc('ABCD'[d.c] + ') ' + d.o[d.c]) + ' <span class="muted">(1 punto)</span></span></div>';
      var inter = -1;
      if (d.p) { for (var z = 0; z < d.p.length; z++) { if (d.p[z] === 0.5) { inter = z; break; } } }
      if (inter >= 0) {
        html += '<div><span class="k">Intermedia</span><span class="muted">' + esc('ABCD'[inter] + ') ' + d.o[inter]) + ' (0,50)</span></div>';
      }
    } else {
      var tuaTxt2 = NESSUNA;
      if (tua !== null) {
        tuaTxt2 = '<span class="' + (cls === 'ok' ? '' : 'strike') + '">' + esc('ABCD'[tua] + ') ' + d.o[tua]) + '</span>';
      }
      html += '<div><span class="k">Tua risposta</span><span>' + tuaTxt2 + '</span></div>';
      html += '<div><span class="k">Corretta</span><span><b>' + esc('ABCD'[d.c] + ') ' + d.o[d.c]) + '</b></span></div>';
    }
    html += '</div>' +
      '<p class="why">' + esc(d.e) + '</p>' +
      '<p class="ref">' + esc(d.rif) + '</p>' +
      '<div class="acts">' +
      (sez ? '<a class="btn btn-primary small" href="#studio-' + esc(d.sr) + '">Studia l\'argomento: ' + esc(sez.titolo) + ' →</a>' : '') +
      (fonte.url ? '<a class="btn btn-ghost small" href="' + esc(fonte.url) + '" target="_blank" rel="noopener noreferrer">Fonte normativa ↗</a>' : '') +
      '</div>' +
      (u ? '<p class="small muted" style="margin-top:.45rem">Unità ' + u.numero + ' — ' + esc(u.titolo) + '</p>' : '') +
      '</article>';
    return el(html);
  }

  // ------------------------------------------------------------- andamento
  function vistaAndamento(root) {
    var m = perMateria();
    var st = statistiche();
    var sess = store.sessioni.slice().reverse();

    var w = el('<div class="stack">' +
      '<div><p class="eyebrow">Andamento</p><h1>Come stai andando</h1>' +
      '<p class="lead" style="margin-top:.35rem">I dati restano su questo dispositivo, nel browser. Nessun invio a server.</p></div>' +
      '<div class="grid g-4">' +
      '<div class="tile"><div class="k">Sessioni</div><div class="v">' + store.sessioni.length + '</div><div class="n">registrate</div></div>' +
      '<div class="tile"><div class="k">Domande affrontate</div><div class="v">' + st.domandeViste + '</div><div class="n">su ' + DOM.totale + '</div></div>' +
      '<div class="tile"><div class="k">Risposte date</div><div class="v">' + st.risposte + '</div><div class="n">in tutte le sessioni</div></div>' +
      '<div class="tile"><div class="k">Da ripassare</div><div class="v" style="color:var(--bad)">' +
      (DOM.domande || []).filter(function (q) { var s = store.stats[q.id]; return s && s.e > 0; }).length +
      '</div><div class="n">errori ancora aperti</div></div>' +
      '</div>' +
      '<section class="stack-s"><h2 style="font-size:1.15rem">Copertura per materia</h2><div class="matrow" id="mats"></div></section>' +
      '<section class="stack-s"><h2 style="font-size:1.15rem">Ultime sessioni</h2><div id="hist"></div></section>' +
      '<div class="row"><button class="btn" id="reset" type="button">Azzera i dati di studio</button></div>' +
      '</div>');
    root.appendChild(w);

    var mats = $('#mats', w);
    Object.keys(m).sort(function (a, b) { return m[b].tot - m[a].tot; }).forEach(function (k) {
      var x = m[k];
      var cop = Math.round(100 * x.viste / x.tot);
      var acc = x.risposte ? Math.round(100 * (x.risposte - x.errate) / x.risposte) : null;
      mats.appendChild(el('<div class="r">' +
        '<div class="top"><b>' + esc(k) + '</b><span>' + x.viste + '/' + x.tot + ' viste' +
        (acc === null ? '' : ' · ' + acc + '% corrette') + '</span></div>' +
        '<div class="bar"><i class="' + (acc === null ? 'none' : (acc >= 75 ? 'ok' : acc >= 50 ? 'warn' : 'bad')) + '" style="width:' + cop + '%"></i></div>' +
        '</div>'));
    });

    var hist = $('#hist', w);
    if (!sess.length) hist.appendChild(el('<p class="muted">Nessuna sessione ancora.</p>'));
    else {
      var t = el('<div class="tablewrap"><table class="hist"><thead><tr>' +
        '<th>Data</th><th>Sessione</th><th>Domande</th><th>Punti</th><th>Corrette</th><th>Errate</th><th>Non date</th>' +
        '</tr></thead><tbody></tbody></table></div>');
      sess.slice(0, 25).forEach(function (s) {
        $('tbody', t).appendChild(el('<tr>' +
          '<td class="n">' + esc(dataIt(s.data)) + '</td>' +
          '<td>' + esc(s.titolo) + (s.simulazione ? ' <span class="pill ' + (s.punti >= 21 ? 'ok' : 'bad') + '">' + (s.punti >= 21 ? 'idoneo' : 'sotto soglia') + '</span>' : '') + '</td>' +
          '<td class="n">' + s.n + '</td>' +
          '<td class="n">' + num(s.punti) + '/' + num(s.max) + '</td>' +
          '<td class="n">' + s.ok + '</td>' +
          '<td class="n">' + s.bad + '</td>' +
          '<td class="n">' + s.none + '</td>' +
          '</tr>'));
      });
      hist.appendChild(t);
    }

    $('#reset', w).addEventListener('click', function () {
      var btn = $('#reset', w);
      if (btn.getAttribute('data-armed') !== '1') {
        btn.setAttribute('data-armed', '1');
        btn.textContent = 'Confermi? Premi di nuovo per azzerare';
        btn.classList.add('btn-primary');
        return;
      }
      store.stats = {}; store.sessioni = []; store.sezioniViste = {}; store.ultimoEsito = null; store.quizAperto = null;
      save(); render();
    });
  }

  // ----------------------------------------------------------------- bando
  function vistaBando(root) {
    var b = BAN, p = b.prova;
    root.appendChild(el('<div class="stack col-read">' +
      '<div><p class="eyebrow">Bando · verifica delle fonti ' + esc(b.verifica) + '</p>' +
      '<h1>' + esc(b.ente) + ' — ' + esc(b.posti) + ' istruttori amministrativo-contabili</h1>' +
      '<p class="lead" style="margin-top:.35rem">' + esc(b.profilo) + '. ' + esc(b.procedura) + ', ' + esc(b.tipo_rapporto) + '.</p></div>' +

      '<section class="card stack-s"><h2 style="font-size:1.1rem">La prova</h2>' +
      '<p>' + esc(p.descrizione) + '.</p>' +
      '<ul style="margin:0;padding-left:1.1rem">' +
      '<li>' + p.quesiti + ' quesiti in ' + p.minuti + ' minuti, ' + p.punteggio_totale + ' punti a disposizione.</li>' +
      p.composizione.map(function (c) { return '<li>' + c.numero + ' ' + esc(c.etichetta.toLowerCase()) + ': ' + esc(c.regola) + '.</li>'; }).join('') +
      '<li>Soglia di superamento: <b>' + esc(p.soglia) + '</b>.</li>' +
      '<li>' + esc(p.avviso_convocazione.charAt(0).toUpperCase() + p.avviso_convocazione.slice(1)) + '.</li>' +
      '</ul></section>' +

      '<section class="card stack-s"><h2 style="font-size:1.1rem">Materie dei 20 quesiti tecnici</h2>' +
      '<ol style="margin:0;padding-left:1.2rem">' + p.materie_tecniche.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<p class="small muted">Più: ' + p.altre_competenze.map(esc).join(' · ') + '.</p></section>' +

      '<section class="card stack-s"><h2 style="font-size:1.1rem">Domanda di partecipazione</h2>' +
      '<ul style="margin:0;padding-left:1.1rem">' +
      '<li>Canale: ' + esc(b.domanda.canale) + '.</li>' +
      '<li>Autenticazione: ' + esc(b.domanda.autenticazione) + '.</li>' +
      '<li>Termine: ' + esc(b.domanda.termine) + '.</li>' +
      '<li>Tassa di concorso: ' + esc(b.domanda.tassa) + '.</li>' +
      '<li>Titolo di studio: ' + esc(b.domanda.titolo_studio) + '.</li>' +
      '</ul></section>' +

      '<section class="stack-s"><h2 style="font-size:1.1rem">Avvertenze</h2>' +
      b.avvertenze.map(function (a) { return '<div class="notice">' + esc(a) + '</div>'; }).join('') +
      '</section>' +

      '<section class="srcbox"><p class="eyebrow">Fonti</p><ul>' +
      b.fonti.map(function (f) { return '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' + esc(f.titolo) + '</a></li>'; }).join('') +
      '</ul></section>' +
      '</div>'));
  }

  // ------------------------------------------------------------------ avvio
  function avvia() {
    indicizza();
    load();
    applicaTema();
    $('#tema-btn').addEventListener('click', function () {
      var ordine = ['auto', 'light', 'dark'];
      store.prefs.tema = ordine[(ordine.indexOf(store.prefs.tema) + 1) % 3];
      save(); applicaTema();
    });
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', function (e) {
      if (rotta().v !== 'quiz' || !store.quizAperto) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      var k = e.key.toLowerCase();
      var map = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
      if (map[k] !== undefined) { var opts = $$('.opt'); if (opts[map[k]]) { opts[map[k]].click(); e.preventDefault(); } }
      else if (e.key === 'ArrowRight') { var n = $('#next'); if (n) n.click(); }
      else if (e.key === 'ArrowLeft') { var p = $('#prev'); if (p && !p.disabled) p.click(); }
    });
    render();
  }

  function mancanti() {
    var m = [];
    if (!DOM) m.push('data/domande.js');
    if (!STU) m.push('data/studio.js');
    if (!BAN) m.push('data/bando.js');
    return m;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var m = mancanti();
    if (m.length) {
      $('#view').innerHTML = '<div class="notice">Dati non caricati: ' + m.map(esc).join(', ') +
        '. Rigenera i file con <span class="mono">node work/js/build.js</span> e <span class="mono">node work/js/build_studio.js</span>.</div>';
      return;
    }
    avvia();
  });

  // Punto di verifica delle regole di punteggio e composizione (usato per i controlli).
  window.__VERIFICA = {
    ripartizione: ripartizione,
    puntiDomanda: puntiDomanda,
    esitoDomanda: esitoDomanda,
    maxDomanda: maxDomanda,
    candidati: candidati,
    dati: function () { return { DOM: DOM, STU: STU, BAN: BAN, sezById: sezById, qBySez: qBySez }; }
  };

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* opzionale */ });
    });
  }
})();
