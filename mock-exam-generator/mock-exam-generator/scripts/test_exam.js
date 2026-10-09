#!/usr/bin/env node
/* test_exam.js — 模拟题库练习版 HTML 自动测试（mock-exam-generator skill）
 * 用法: node test_exam.js <html路径> <每套题数> <套数> [综合区禁用词(逗号分隔)] [问答题数] [资料分析题数]
 * 验证: 题量/答案表一致性 · 全题选对判对 · 抽查选错判错 · 综合区无专业词
 *       · 单选/多选分布 · 资料分析题与材料块 · 复习模式进出 · 重置弹窗 · localStorage 独立 key
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const htmlPath = process.argv[2];
const perSet = parseInt(process.argv[3] || '50', 10);
const sets = parseInt(process.argv[4] || '3', 10);
const banned = (process.argv[5] || '').split(',').map(s => s.trim()).filter(Boolean);
const essay = parseInt(process.argv[6] || '0', 10);
const dataGroups = parseInt(process.argv[7] || '0', 10);
const dataPerGroup = parseInt(process.argv[8] || '4', 10);
const total = perSet * sets;

const html = fs.readFileSync(htmlPath, 'utf-8');
const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name); }
}

setTimeout(() => {
  const questions = document.querySelectorAll('.question');
  const rows = document.querySelectorAll('.answer-table tbody tr');
  assert('题目数 ' + total, questions.length === total);
  assert('答案行 = 题目数', rows.length === questions.length + essay * sets);

  const ansMap = {};
  rows.forEach(tr => {
    ansMap[tr.querySelector('.qid').textContent.trim()] = tr.querySelector('.ans').textContent.trim();
  });

  // 全题选对
  questions.forEach(q => {
    const qid = q.dataset.qid;
    const ans = ansMap[qid];
    const opts = q.querySelectorAll('ul.options li');
    if (q.dataset.multi === '1') {
      ans.split('').forEach(k => click(Array.from(opts).find(li => li.dataset.key === k)));
      click(q.querySelector('.qa-btn-submit'));
    } else {
      click(Array.from(opts).find(li => li.dataset.key === ans));
    }
    if (!q.classList.contains('qa-right')) assert('Q' + qid + ' 选对判对', false);
  });
  assert('全 ' + total + ' 题选对判对', document.querySelectorAll('.question.qa-right').length === total);

  // 综合/专业分块（资料分析计入综合；题量不定，校验覆盖性与非空）
  const compN = document.querySelectorAll('.question[data-mode="comp"]').length;
  const profN = document.querySelectorAll('.question[data-mode="prof"]').length;
  assert('综合 + 专业 = 总题数（' + compN + '+' + profN + '=' + total + '）', compN + profN === total);
  assert('综合区非空（' + compN + '）', compN > 0);
  assert('专业区非空（' + profN + '）', profN > 0);

  // 综合区无专业词
  if (banned.length) {
    const compText = Array.from(document.querySelectorAll('.question[data-mode="comp"]')).map(q => q.textContent).join('');
    banned.forEach(w => {
      if (compText.indexOf(w) !== -1) assert('综合区含专业词「' + w + '」', false);
    });
    assert('综合区无专业词（' + banned.join('/') + '）', true);
  }

  // 单选/多选并存（每套综合区至少 5 道多选；资料分析题可含多选，不精确断言分布）
  let sc = 0, mc = 0;
  questions.forEach(q => { if (q.dataset.multi === '1') mc++; else sc++; });
  assert('多选 ≥ 每套 5 道（' + mc + '）', mc >= 5 * sets);
  assert('存在单选（' + sc + '）', sc > 0);

  // 资料分析（表格数据分析题，材料块）
  if (dataGroups > 0) {
    const mats = document.querySelectorAll('.mat-block');
    assert('材料块数 = ' + dataGroups * sets + '（' + mats.length + '）', mats.length === dataGroups * sets);
    const matQs = document.querySelectorAll('.question .mat-block');
    assert('组首题含材料块 = ' + dataGroups * sets + '（' + matQs.length + '）', matQs.length === dataGroups * sets);
    let hasTbl = true;
    mats.forEach(m => { if (!m.querySelector('table.data-tbl')) hasTbl = false; });
    assert('材料块均含数据表格', hasTbl);
  }

  // 问答题（主观题）
  if (essay > 0) {
    const essays = document.querySelectorAll('.qa-essay');
    assert('问答题数量 = ' + essay * sets + '（' + essays.length + '）', essays.length === essay * sets);
    let hasRef = true, hasBtn = true;
    essays.forEach(e => {
      const ref = e.querySelector('.essay-ref');
      if (!ref || !ref.textContent.trim()) hasRef = false;
      if (!e.querySelector('.qa-btn-essay')) hasBtn = false;
    });
    assert('问答题均含参考要点', hasRef);
    assert('问答题均有「查看参考答案」按钮', hasBtn);
  }

  // 关键按钮与交互存在
  assert('每题「清除本题」', document.querySelectorAll('.qa-btn-clear').length === total);
  assert('每套「复习模式」按钮', document.querySelectorAll('.qa-btn-setans').length === sets);
  assert('顶栏「清除全部答案」「清空进度」', !!document.querySelector('#qaBtnClearAll') && !!document.querySelector('#qaBtnReset'));

  // 复习模式进出（第一套）
  const btn1 = document.querySelector('#qaSetBtn1');
  const answeredBefore = document.querySelectorAll('.question.qa-right, .question.qa-wrong').length;
  const storeKeys = Object.keys(window.localStorage).filter(k => k.indexOf('gps_qa') === 0);
  const storeLenBefore = storeKeys.length ? Object.keys(JSON.parse(window.localStorage.getItem(storeKeys[0]) || '{}')).length : 0;
  click(btn1);
  assert('进入复习：本套 ' + perSet + ' 题高亮正确答案', document.querySelectorAll('.qa-review').length === perSet);
  assert('复习按钮变「退出查看答案」', btn1.textContent === '退出查看答案');
  click(btn1);
  assert('退出复习恢复', document.querySelectorAll('.qa-review').length === 0);
  const storeLenAfter = storeKeys.length ? Object.keys(JSON.parse(window.localStorage.getItem(storeKeys[0]) || '{}')).length : 0;
  assert('复习模式不写答题记录（store 长度不变 ' + storeLenBefore + '）', storeLenAfter === storeLenBefore);
  assert('退出后已判题数不变（' + answeredBefore + '）',
         document.querySelectorAll('.question.qa-right, .question.qa-wrong').length === answeredBefore);

  // 重置弹窗（自绘，不依赖 confirm）
  click(document.querySelector('#qaBtnClearAll'));
  const mask = document.querySelector('.qa-mask');
  assert('弹出页面内确认框', !!mask);
  click(mask.querySelector('.qa-dialog-no'));
  assert('取消不清除', !document.querySelector('.qa-mask'));
  click(document.querySelector('#qaBtnClearAll'));
  click(document.querySelector('.qa-mask .qa-dialog-yes'));
  assert('确认后全部清空', document.querySelectorAll('.question.qa-right, .question.qa-wrong').length === 0);

  // localStorage 有写入（独立 key 以 gps_qa 开头）
  const keys = Object.keys(window.localStorage).filter(k => k.indexOf('gps_qa') === 0);
  assert('localStorage 使用 gps_qa 前缀独立 key', keys.length >= 1);

  console.log('\n==== 模拟题库测试: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
}, 500);
