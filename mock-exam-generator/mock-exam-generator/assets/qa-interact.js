(function () {
  'use strict';

  /* 存储 key：不同题库用独立 key，避免相互污染；
     新版题库在注入 JS 前设置 window.__QA_STORE_KEY__ */
  var STORE_KEY = (typeof window !== 'undefined' && window.__QA_STORE_KEY__)
    ? window.__QA_STORE_KEY__ : 'gps_qa_v1';

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isRight(picked, ans) {
    return picked.slice().sort().join('') === ans.split('').sort().join('');
  }

  var store = loadStore();
  var answers = {};
  var sets = [];

  /* ========== 1. 从答案表提取 题号 -> {答案, 简析} ========== */
  document.querySelectorAll('.answer-table').forEach(function (t) {
    t.querySelectorAll('tbody tr').forEach(function (tr) {
      var qidEl = tr.querySelector('.qid');
      var ansEl = tr.querySelector('.ans');
      if (!qidEl || !ansEl) return;
      var noteEl = tr.querySelector('td:last-child');
      answers[qidEl.textContent.trim()] = {
        ans: ansEl.textContent.trim().toUpperCase(),
        note: noteEl ? noteEl.textContent.trim() : ''
      };
    });
  });

  /* ========== 2. 给每道题打标：套号 + 综合/专业 ========== */
  document.querySelectorAll('section[role^="set"]').forEach(function (sec) {
    var setNo = sec.getAttribute('role').replace('set', '');
    var mode = 'comp';
    var qids = [];
    Array.prototype.forEach.call(sec.querySelectorAll('h3, h4, .question'), function (el) {
      if (el.tagName === 'H3' || el.tagName === 'H4') {
        var tx = el.textContent;
        if (tx.indexOf('专业') > -1) mode = 'prof';
        else if (tx.indexOf('综合') > -1) mode = 'comp';
      } else {
        var qnoEl = el.querySelector('.q-no');
        if (qnoEl) {
          var qid = qnoEl.textContent.replace(/\.$/, '').trim();
          el.dataset.qid = qid;
          el.dataset.set = setNo;
          el.dataset.mode = mode;
          el.id = 'q' + qid;
          qids.push(qid);
        }
      }
    });
    sets.push({ sec: sec, no: setNo, qids: qids });
  });

  /* ========== 3. 每题交互 ========== */
  function onPick(q, key) {
    if (reviewSnapshot) return;   // 复习模式中禁止作答，先点「退出查看答案」
    var multi = q.dataset.multi === '1';
    var lis = Array.prototype.slice.call(q.querySelectorAll('ul.options li'));
    if (multi) {
      var target = null;
      lis.forEach(function (l) { if (l.dataset.key === key) target = l; });
      if (target) target.classList.toggle('picked');
      clearResult(q, false);
    } else {
      lis.forEach(function (l) { l.classList.remove('picked'); });
      var pickedLi = null;
      lis.forEach(function (l) { if (l.dataset.key === key) pickedLi = l; });
      if (pickedLi) pickedLi.classList.add('picked');
      finish(q, [key]);
    }
  }

  function finish(q, picked) {
    var qid = q.dataset.qid;
    store[qid] = { picked: picked.slice(), done: true };
    saveStore();
    applyResult(q, picked);
    updateAll();
  }

  function clearResult(q, resetPick) {
    var qid = q.dataset.qid;
    if (resetPick) {
      q.querySelectorAll('ul.options li').forEach(function (l) { l.classList.remove('picked'); });
      if (store[qid]) { delete store[qid]; saveStore(); }
    } else {
      if (store[qid]) { store[qid].done = false; saveStore(); }
    }
    q.classList.remove('qa-right', 'qa-wrong', 'qa-miss');
    q.querySelectorAll('ul.options li').forEach(function (l) {
      l.classList.remove('correct', 'wrong');
    });
    var fb = q.querySelector('.qa-fb');
    if (fb) fb.innerHTML = '';
    var det = q.querySelector('.qa-detail');
    if (det) det.style.display = 'none';
  }

  function applyResult(q, picked) {
    var a = answers[q.dataset.qid];
    if (!a) return;
    var right = isRight(picked, a.ans);
    q.classList.remove('qa-right', 'qa-wrong', 'qa-miss');
    q.classList.add(right ? 'qa-right' : 'qa-wrong');
    if (!right) q.classList.add('qa-miss');

    q.querySelectorAll('ul.options li').forEach(function (li) {
      var k = li.dataset.key;
      li.classList.remove('correct', 'wrong');
      if (a.ans.indexOf(k) > -1) li.classList.add('correct');
      else if (picked.indexOf(k) > -1) li.classList.add('wrong');
    });

    var fb = q.querySelector('.qa-fb');
    if (!fb) return;
    fb.innerHTML = '';
    var tag = document.createElement('span');
    tag.className = right ? 'tag tag-right' : 'tag tag-wrong';
    tag.textContent = right ? '回答正确' : '回答错误';
    fb.appendChild(tag);
    var ansTxt = document.createElement('span');
    ansTxt.className = 'ans-txt';
    ansTxt.textContent = '正确答案：' + a.ans;
    fb.appendChild(ansTxt);
    var showMore = document.createElement('button');
    showMore.type = 'button';
    showMore.className = 'qa-btn qa-btn-more';
    showMore.textContent = '看解析';
    showMore.addEventListener('click', function () { toggleDetail(q); });
    fb.appendChild(showMore);
  }

  function toggleDetail(q) {
    var det = q.querySelector('.qa-detail');
    if (!det) {
      var a = answers[q.dataset.qid];
      if (!a) return;
      det = document.createElement('div');
      det.className = 'qa-detail';
      det.innerHTML = '<div class="qa-detail-ans">正确答案：<b>' + escapeHtml(a.ans) + '</b></div>' +
        (a.note ? '<div class="qa-detail-note">' + escapeHtml(a.note) + '</div>' : '');
      q.appendChild(det);
    }
    det.style.display = det.style.display === 'block' ? 'none' : 'block';
  }

  function submitMulti(q) {
    var picked = Array.prototype.filter.call(q.querySelectorAll('ul.options li.picked'), function (l) { return l.dataset.key; })
      .map(function (l) { return l.dataset.key; });
    if (!picked.length) {
      flash(q);
      return;
    }
    finish(q, picked);
  }

  function flash(q) {
    q.classList.remove('qa-flash');
    void q.offsetWidth;
    q.classList.add('qa-flash');
  }

  function initQuestion(q) {
    var qid = q.dataset.qid;
    if (!qid) return;
    var badge = q.querySelector('.q-badge');
    var multi = badge && badge.classList.contains('q-multi');
    q.dataset.multi = multi ? '1' : '0';

    q.querySelectorAll('ul.options li').forEach(function (li) {
      var keyEl = li.querySelector('.opt-key');
      if (!keyEl) return;
      var key = keyEl.textContent.replace('.', '').trim().toUpperCase();
      li.dataset.key = key;
      li.classList.add('qa-opt');
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.addEventListener('click', function () { onPick(q, key); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(q, key); }
      });
    });

    var bar = document.createElement('div');
    bar.className = 'qa-bar';
    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'qa-btn qa-btn-submit';
    submit.textContent = '确认本题答案';
    submit.style.display = multi ? '' : 'none';
    var show = document.createElement('button');
    show.type = 'button';
    show.className = 'qa-btn qa-btn-show';
    show.textContent = '查看答案';
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'qa-btn qa-btn-clear';
    clear.textContent = '清除本题';
    var fb = document.createElement('div');
    fb.className = 'qa-fb';
    bar.appendChild(submit);
    bar.appendChild(show);
    bar.appendChild(clear);
    bar.appendChild(fb);
    q.appendChild(bar);

    submit.addEventListener('click', function () { submitMulti(q); });
    show.addEventListener('click', function () { toggleDetail(q); });
    clear.addEventListener('click', function () { clearResult(q, true); updateAll(); });

    /* 恢复历史状态 */
    var rec = store[qid];
    if (rec && rec.picked && rec.picked.length) {
      rec.picked.forEach(function (k) {
        q.querySelectorAll('ul.options li').forEach(function (li) {
          if (li.dataset.key === k) li.classList.add('picked');
        });
      });
      if (rec.done) applyResult(q, rec.picked);
    }
  }

  document.querySelectorAll('.question').forEach(initQuestion);

  /* ========== 4. 每套：复习模式（题目上自动高亮正确答案） + 本套进度 ========== */
  var reviewSnapshot = null;

  function snapshotQuestion(q) {
    var fb = q.querySelector('.qa-fb');
    var det = q.querySelector('.qa-detail');
    return {
      q: q,
      qClass: q.className,
      optClasses: Array.prototype.map.call(q.querySelectorAll('ul.options li'), function (li) { return li.className; }),
      fbHTML: fb ? fb.innerHTML : '',
      detailDisplay: det ? det.style.display : ''
    };
  }

  function restoreSnapshot(s) {
    s.q.className = s.qClass;
    s.q.querySelectorAll('ul.options li').forEach(function (li, i) {
      li.className = s.optClasses[i] || '';
    });
    var fb = s.q.querySelector('.qa-fb');
    if (fb) fb.innerHTML = s.fbHTML;
    var det = s.q.querySelector('.qa-detail');
    if (det) det.style.display = s.detailDisplay;
  }

  /* 复习模式渲染：只高亮正确答案 + 显示答案，不写入答题记录 */
  function reviewShow(q) {
    var a = answers[q.dataset.qid];
    if (!a) return;
    q.classList.add('qa-review');
    q.classList.remove('qa-right', 'qa-wrong', 'qa-miss');
    q.querySelectorAll('ul.options li').forEach(function (li) {
      li.classList.remove('picked', 'wrong');
      if (a.ans.indexOf(li.dataset.key) > -1) li.classList.add('correct');
      else li.classList.remove('correct');
    });
    var det = q.querySelector('.qa-detail');
    if (det) det.style.display = 'none';
    var fb = q.querySelector('.qa-fb');
    if (!fb) return;
    fb.innerHTML = '<span class="ans-txt">正确答案：' + escapeHtml(a.ans) + '</span>' +
      '<button type="button" class="qa-btn qa-btn-more" data-review-more>看解析</button>';
    var more = fb.querySelector('[data-review-more]');
    if (more) more.addEventListener('click', function () { toggleDetail(q); });
  }

  function exitReview() {
    if (!reviewSnapshot) return;
    reviewSnapshot.snaps.forEach(restoreSnapshot);
    var b = document.getElementById('qaSetBtn' + reviewSnapshot.setNo);
    if (b) b.textContent = '查看本套全部答案';
    reviewSnapshot = null;
  }

  function toggleReviewSet(s, btn) {
    if (reviewSnapshot && reviewSnapshot.setNo === s.no) {
      exitReview();
      btn.textContent = '查看本套全部答案';
      return;
    }
    if (reviewSnapshot) exitReview();
    var snaps = [];
    s.sec.querySelectorAll('.question').forEach(function (q) {
      snaps.push(snapshotQuestion(q));
      reviewShow(q);
    });
    reviewSnapshot = { setNo: s.no, snaps: snaps };
    btn.textContent = '退出查看答案';
    var h = s.sec.querySelector('.set-heading');
    if (h && h.scrollIntoView) { try { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }

  function initSetBar(s) {
    var lead = s.sec.querySelector('.set-lead');
    if (!lead) return;
    var wrap = document.createElement('div');
    wrap.className = 'qa-setbar';

    var prog = document.createElement('span');
    prog.className = 'qa-setprog';
    prog.id = 'qaSetProg' + s.no;
    wrap.appendChild(prog);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qa-btn qa-btn-setans';
    btn.id = 'qaSetBtn' + s.no;
    btn.textContent = '查看本套全部答案';
    wrap.appendChild(btn);

    btn.addEventListener('click', function () { toggleReviewSet(s, btn); });

    lead.parentNode.insertBefore(wrap, lead.nextSibling);

    /* 每套末尾错题清单容器 */
    var wrong = document.createElement('div');
    wrong.className = 'qa-wronglist';
    wrong.style.display = 'none';
    wrong.innerHTML = '<div class="qa-wronglist-title">本套错题清单</div>';
    s.sec.appendChild(wrong);
    s.wrongEl = wrong;
  }

  sets.forEach(initSetBar);

  /* ========== 5. 顶部统计栏 ========== */
  function computeStats() {
    var st = {
      total: 0, answered: 0, right: 0,
      comp: { total: 0, answered: 0, right: 0 },
      prof: { total: 0, answered: 0, right: 0 }
    };
    document.querySelectorAll('.question').forEach(function (q) {
      var qid = q.dataset.qid;
      var mode = q.dataset.mode || 'comp';
      st.total++;
      st[mode].total++;
      var rec = store[qid];
      if (rec && rec.done) {
        st.answered++;
        st[mode].answered++;
        var a = answers[qid];
        var right = a && isRight(rec.picked, a.ans);
        if (right) { st.right++; st[mode].right++; }
      }
    });
    return st;
  }

  function countWrong() {
    var n = 0;
    document.querySelectorAll('.question').forEach(function (q) {
      var rec = store[q.dataset.qid];
      if (rec && rec.done && answers[q.dataset.qid]) {
        if (!isRight(rec.picked, answers[q.dataset.qid].ans)) n++;
      }
    });
    return n;
  }

  function updateTopbar(st) {
    if (!st) st = computeStats();
    var els = {
      total: document.getElementById('qaS-total'),
      answered: document.getElementById('qaS-answered'),
      right: document.getElementById('qaS-right'),
      rate: document.getElementById('qaS-rate'),
      comp: document.getElementById('qaM-comp'),
      prof: document.getElementById('qaM-prof')
    };
    if (els.total) els.total.textContent = st.total;
    if (els.answered) els.answered.textContent = st.answered;
    if (els.right) els.right.textContent = st.right;
    if (els.rate) els.rate.textContent = st.answered ? Math.round(st.right / st.answered * 100) + '%' : '--';
    if (els.comp) els.comp.textContent = '综合 ' + st.comp.right + '/' + st.comp.answered + '（共' + st.comp.total + '）';
    if (els.prof) els.prof.textContent = '专业 ' + st.prof.right + '/' + st.prof.answered + '（共' + st.prof.total + '）';

    sets.forEach(function (s) {
      var prog = document.getElementById('qaSetProg' + s.no);
      if (!prog) return;
      var an = 0, r = 0;
      s.qids.forEach(function (qid) {
        var rec = store[qid];
        if (rec && rec.done) {
          an++;
          if (answers[qid] && isRight(rec.picked, answers[qid].ans)) r++;
        }
      });
      prog.textContent = '本套进度：已答 ' + an + '/' + s.qids.length + '，正确 ' + r;
    });
  }

  function updateWrongLists() {
    var totalWrong = countWrong();
    sets.forEach(function (s) {
      var items = [];
      s.qids.forEach(function (qid) {
        var rec = store[qid];
        if (rec && rec.done && answers[qid] && !isRight(rec.picked, answers[qid].ans)) {
          var q = document.getElementById('q' + qid);
          var stem = q ? q.querySelector('.q-line').textContent.trim() : qid;
          items.push('<div class="qa-wl-item"><a href="#q' + qid + '">第 ' + qid + ' 题</a> · ' + escapeHtml(stem.slice(0, 40)) + '…</div>');
        }
      });
      s.wrongEl.innerHTML = '<div class="qa-wronglist-title">本套错题清单（' + items.length + ' 题）</div>' + items.join('');
      s.wrongEl.style.display = items.length ? 'block' : 'none';
    });
    var btn = document.getElementById('qaBtnWrong');
    if (btn) {
      btn.style.display = totalWrong ? '' : 'none';
      btn.textContent = totalWrong ? '错题清单（' + totalWrong + '）' : '错题清单';
    }
  }

  function updateAll() {
    var st = computeStats();
    updateTopbar(st);
    updateWrongLists();
  }

  /* 清除全部已选答案：立即重置页面与存储，不刷新 */
  function clearAllAnswers() {
    store = {};
    saveStore();
    document.querySelectorAll('.question').forEach(function (q) {
      q.querySelectorAll('ul.options li').forEach(function (li) {
        li.classList.remove('picked', 'correct', 'wrong');
      });
      q.classList.remove('qa-right', 'qa-wrong', 'qa-miss');
      var fb = q.querySelector('.qa-fb');
      if (fb) fb.innerHTML = '';
      var det = q.querySelector('.qa-detail');
      if (det) det.style.display = 'none';
    });
    updateAll();
  }

  /* 自绘确认弹窗：不依赖 window.confirm（在部分内嵌浏览器/预览面板中被禁用，会导致按钮“点击无效”） */
  function askConfirm(message, onYes) {
    var overlay = document.createElement('div');
    overlay.className = 'qa-mask';
    overlay.innerHTML =
      '<div class="qa-dialog" role="dialog" aria-modal="true">' +
      '<div class="qa-dialog-title">确认操作</div>' +
      '<div class="qa-dialog-msg">' + escapeHtml(message) + '</div>' +
      '<div class="qa-dialog-actions">' +
      '<button type="button" class="qa-btn qa-dialog-no">取消</button>' +
      '<button type="button" class="qa-btn qa-btn-danger qa-dialog-yes">确认</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.qa-dialog-no').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('.qa-dialog-yes').addEventListener('click', function () { overlay.remove(); onYes(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  function buildTopbar() {
    var bar = document.createElement('div');
    bar.className = 'qa-topbar';
    bar.innerHTML =
      '<div class="qa-top-inner">' +
      '<div class="qa-top-title">' + (document.title || '模拟题库') + '</div>' +
      '<div class="qa-top-stats">已答 <span id="qaS-answered">0</span>/<span id="qaS-total">0</span> · 正确 <span id="qaS-right">0</span> · <span id="qaS-rate">--</span></div>' +
      '<div class="qa-top-modes"><span id="qaM-comp">综合 --</span><span id="qaM-prof">专业 --</span></div>' +
      '<div class="qa-top-actions">' +
      '<button type="button" class="qa-btn qa-btn-wrong" id="qaBtnWrong" style="display:none">错题清单</button>' +
      '<button type="button" class="qa-btn qa-btn-clearall" id="qaBtnClearAll">清除全部答案</button>' +
      '<button type="button" class="qa-btn qa-btn-reset" id="qaBtnReset">清空进度</button>' +
      '</div>' +
      '</div>';
    document.body.insertBefore(bar, document.body.firstChild);

    document.getElementById('qaBtnClearAll').addEventListener('click', function () {
      askConfirm('确定清除全部已选答案与判定吗？统计将归零，可重新作答。', clearAllAnswers);
    });

    document.getElementById('qaBtnReset').addEventListener('click', function () {
      askConfirm('确定清空全部答题进度吗？此操作不可恢复（删除已保存进度并刷新页面）。', function () {
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        window.location.reload();
      });
    });

    document.getElementById('qaBtnWrong').addEventListener('click', function () {
      var first = null;
      sets.forEach(function (s) {
        if (!first && s.wrongEl && s.wrongEl.style.display === 'block') first = s.wrongEl;
      });
      if (first && first.scrollIntoView) { try { first.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    });
  }

  buildTopbar();
  updateAll();

  /* ========== 注入样式 ========== */
  var css = '' +
    '.qa-topbar{position:sticky;top:0;z-index:1000;background:#ffffff;border-bottom:1px solid #e0e0e0;font-family:var(--ff-heading);box-shadow:0 1px 6px rgba(0,0,0,.06)}' +
    '.qa-top-inner{max-width:760px;margin:0 auto;padding:8px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}' +
    '.qa-top-title{font-weight:600;font-size:15px;color:#1A237E}' +
    '.qa-top-stats{font-size:13px;color:#212121}' +
    '.qa-top-modes{font-size:12px;color:#616161;display:flex;gap:10px}' +
    '.qa-top-actions{margin-left:auto;display:flex;gap:8px}' +
    '.qa-btn{font-family:var(--ff-heading);font-size:13px;line-height:1;padding:8px 14px;border-radius:8px;border:1px solid #b0bec5;background:#fff;color:#185fa5;cursor:pointer;transition:all .15s}' +
    '.qa-btn:active{transform:scale(.97)}' +
    '.qa-btn-submit{border-color:#185fa5;background:#185fa5;color:#fff}' +
    '.qa-btn-show{border-color:#b0bec5;background:#fff;color:#185fa5}' +
    '.qa-btn-more{border-color:#b0bec5;background:#fff;color:#0f6e56;padding:4px 10px;font-size:12px}' +
    '.qa-btn-wrong{border-color:#a32d2d;color:#a32d2d;background:#fff}' +
    '.qa-btn-clearall{border-color:#854F0B;color:#854F0B;background:#FAEEDA}' +
    '.qa-btn-clear{border-color:#bdbdbd;color:#616161;background:#fafafa;padding:4px 10px;font-size:12px}' +
    '.qa-btn-reset{border-color:#bdbdbd;color:#616161;background:#fafafa}' +
    '.qa-btn-setans{margin:4px 0 8px;background:#E6F1FB;border-color:#85B7EB;color:#0C447C}' +
    '.qa-setbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:2px 0 6px}' +
    '.qa-setprog{font-size:12px;color:#616161}' +
    '.qa-opt{cursor:pointer;border-radius:8px;padding:6px 10px;margin:0 -10px;transition:background .12s}' +
    '.qa-opt:hover{background:#F5F7FA}' +
    '.qa-opt.picked{background:#E6F1FB;box-shadow:inset 0 0 0 1.5px #185FA5}' +
    '.qa-opt.correct{background:#EAF3DE;box-shadow:inset 0 0 0 1.5px #3B6D11}' +
    '.qa-opt.wrong{background:#FCEBEB;box-shadow:inset 0 0 0 1.5px #A32D2D}' +
    '.qa-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 14px}' +
    '.qa-fb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}' +
    '.tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}' +
    '.tag-right{background:#EAF3DE;color:#27500A}' +
    '.tag-wrong{background:#FCEBEB;color:#791F1F}' +
    '.ans-txt{color:#0F6E56;font-weight:600}' +
    '.qa-detail{width:100%;margin-top:6px;padding:10px 12px;background:#F5F7FA;border-left:3px solid #1565C0;border-radius:0 8px 8px 0;font-size:13px;color:#212121;display:none}' +
    '.qa-detail-ans{font-weight:600;color:#0F6E56;margin-bottom:4px}' +
    '.qa-setans{margin:4px 0 14px;border:1px solid #E0E0E0;border-radius:10px;overflow:hidden}' +
    '.qa-setans-row{display:flex;gap:10px;padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;align-items:baseline}' +
    '.qa-setans-row:last-child{border-bottom:none}' +
    '.qa-sa-qid{min-width:36px;font-weight:600;color:#1A237E}' +
    '.qa-sa-ans{min-width:46px;font-weight:600;color:#3B6D11}' +
    '.qa-sa-note{color:#616161;flex:1}' +
    '.qa-wronglist{margin:18px 0 8px;border:1px solid #F09595;background:#FCEBEB;border-radius:10px;padding:10px 12px}' +
    '.qa-review{background:#F5F7FA;border-left:3px solid #85B7EB;padding:6px 10px;border-radius:6px}' +
    '.qa-review .qa-opt{pointer-events:none;cursor:default}' +
    '.qa-wronglist-title{font-weight:600;color:#791F1F;margin-bottom:6px}' +
    '.qa-wl-item{font-size:13px;padding:3px 0;color:#212121}' +
    '.qa-wl-item a{color:#185FA5;text-decoration:none}' +
    '.qa-wl-item a:hover{text-decoration:underline}' +
    '.qa-flash{animation:qaFlash 1.2s ease}' +
    '@keyframes qaFlash{0%,100%{background:transparent}30%{background:#FAEEDA}}' +
    'html{scroll-behavior:smooth}' +
    '.question{scroll-margin-top:64px}' +
    '@media (max-width:767px){' +
    'body{font-size:15px}' +
    '.q-line{font-size:15px}' +
    '.options{padding-left:.5em}' +
    '.qa-opt{padding:12px 12px;margin:0}' +
    '.qa-opt:hover{background:transparent}' +
    '.qa-top-title{font-size:14px}' +
    '.qa-btn{font-size:14px;padding:10px 16px}' +
    '.qa-bar{margin-top:8px}' +
    '.qa-btn-setans{width:100%;padding:12px}' +
    '.qa-fb{font-size:14px}' +
    'th,td{font-size:12px;padding:6px 8px}' +
    '.qa-sa-note{font-size:12px}' +
    '.cover-title{font-size:22px}' +
    '.cover-subtitle{font-size:14px}' +
    'h3{font-size:15px}' +
    'h4{font-size:14px}' +
    '.qa-dialog-actions .qa-btn{flex:1}' +
    '}' +
    '.qa-btn-danger{border-color:#a32d2d;background:#a32d2d;color:#fff}' +
    '.qa-mask{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.qa-dialog{background:#fff;border-radius:14px;max-width:320px;width:100%;padding:20px 18px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:var(--ff-heading)}' +
    '.qa-dialog-title{font-size:16px;font-weight:600;color:#1A237E;margin-bottom:8px}' +
    '.qa-dialog-msg{font-size:14px;color:#424242;line-height:1.6;margin-bottom:18px}' +
    '.qa-dialog-actions{display:flex;gap:10px;justify-content:flex-end}' +
    '.qa-dialog-actions .qa-btn{padding:10px 18px;font-size:14px}' +
    '.qa-essay{margin:1.2em 0;padding:14px 14px 12px;border:1px dashed #B0BEC5;border-radius:10px;background:#FBFDFF}' +
    '.qa-essay .q-line{margin-bottom:8px}' +
    '.q-essay-badge{background:#E0F2F1;color:#00695C;border:1px solid #B2DFDB}' +
    '.essay-area{margin-top:8px}' +
    '.essay-area textarea{width:100%;min-height:96px;border:1px solid #CFD8DC;border-radius:8px;padding:10px;font-size:14px;line-height:1.6;font-family:var(--ff-body);resize:vertical;box-sizing:border-box}' +
    '.essay-area textarea:focus{outline:none;border-color:#1565C0}' +
    '.essay-actions{margin-top:8px}' +
    '.essay-ref{margin-top:10px;padding:10px 12px;background:#E8F0FE;border-left:3px solid #1565C0;border-radius:6px;font-size:14px;line-height:1.7;color:#1A237E}' +
    '.mat-block{margin:0 0 10px;padding:10px 12px;background:#F5F7FA;border:1px solid #E0E0E0;border-radius:8px}' +
    '.mat-title{font-size:13px;font-weight:600;color:#1A237E;margin:0 0 8px}' +
    '.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 8px}' +
    '.data-tbl{width:100%;border-collapse:collapse;font-size:12px;margin:0}' +
    '.data-tbl th{background:#E6F1FB;color:#0C447C;font-weight:600;text-align:left;padding:5px 8px;border:1px solid #B5D4F4;white-space:nowrap}' +
    '.data-tbl td{padding:5px 8px;border:1px solid #E0E0E0;text-align:left;white-space:nowrap}' +
    '.data-tbl th:not(:first-child),.data-tbl td:not(:first-child){text-align:right}' +
    '@media print{' +
    '.qa-topbar,.qa-bar,.qa-btn,.qa-fb,.qa-detail,.qa-setans,.qa-wronglist,.qa-mask{display:none !important}' +
    '.qa-essay textarea{display:none}' +
    '.mat-block{page-break-inside:avoid}' +
    '}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ===== 问答题交互（主观题：仅展开/收起参考答案，不判分、不进统计）=====
  document.querySelectorAll('.qa-essay').forEach(function (essay) {
    var btn = essay.querySelector('.qa-btn-essay');
    var ref = essay.querySelector('.essay-ref');
    if (btn && ref) {
      btn.addEventListener('click', function () {
        var hidden = ref.style.display === 'none';
        ref.style.display = hidden ? 'block' : 'none';
        btn.textContent = hidden ? '收起参考答案' : '查看参考答案';
      });
    }
  });
})();
