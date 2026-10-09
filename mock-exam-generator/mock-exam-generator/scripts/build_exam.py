#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_exam.py — 通用模拟题库练习版 HTML 生成器（mock-exam-generator skill）

用法：
  python3 build_exam.py \
    --name "给排水技术岗" --org "四川某环境公司" --difficulty "中等" \
    --sets 3 --per-set 50 --comp 25 --prof 25 \
    --store-key gps_qa_watertech \
    --input-dir ./bank \
    --out ./给排水技术岗模拟题库-练习版.html

可选：资料分析（表格数据分析题，默认不加）
  --data-groups 2     每套材料组数（默认 0 = 不加；每组材料配 4~5 道单选或多选）
  --data-per-group 4  每组题数基准（4 或 5，默认 4；实际每组 4~5 道）

题库数据格式（每套一个 md 文件，位于 --input-dir，命名为 set1.md、set2.md...）：
  # 第一套模拟题
  ## 第一部分 综合能力测试（共 25 题，限时 45 分钟）
  ### 一、常识判断（8 单选 + 2 多选）
  **1.（单选）** 题干...
  - A. 选项
  - B. 选项
  > 答案：A
  > 解析：...
  ## 第二部分 专业能力测试（共 25 题，限时 45 分钟）
  ### 一、xxx（3 题）
  ...
  ### 六、资料分析（2 组材料，每组 4~5 题）   <- 仅 --data-groups>0 时
  **（材料）** 某省 2019—2025 年粮食产量及增速如下表：
  | 年份 | 粮食产量（万吨） | 同比增长率 |
  | --- | --- | --- |
  | 2019 | 6120 | — |
  **26.（单选）** 2025 年该省粮食产量较 2019 年增长约（ ）。
  - A. 12.6%
  > 答案：B
  > 解析：...
  **27.（多选）** 下列说法正确的有（ ）。
  ...
  > 答案：AC
  > 解析：...
"""
import argparse, io, os, re, sys

def md_table_to_html(rows):
    """markdown 表格行列表 -> HTML <table class="data-tbl">（含横向滚动容器）"""
    out = ['<div class="tbl-wrap">', '<table class="data-tbl">']
    for i, row in enumerate(rows):
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c.replace(" ", "")) for c in cells if c):
            continue
        tag = "th" if i == 0 else "td"
        out.append("<tr>" + "".join("<%s>%s</%s>" % (tag, c, tag) for c in cells) + "</tr>")
    out.append("</table>")
    out.append("</div>")
    return "\n".join(out)

def parse_set(path):
    """解析单个套题数据文件 -> [{title, mode(comp/prof), mods:[{title, questions:[...]}]}]
    question: {no, type(单选/多选/问答), text, opts, ans, note, mat}
    mat: {id, title, html} 或 None（资料分析题必带；材料块仅渲染一次）
    资料分析题 = 普通单选/多选 + 引用材料块（材料块后紧跟的一组题）
    """
    parts = []
    cur_part = None
    cur_mod = None
    cur_q = None
    cur_mat = None
    mat_seq = 0
    with io.open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if line.startswith("## "):
                cur_q = None
                cur_mat = None
                title = line[3:].strip()
                mode = "prof" if ("专业" in title) else "comp"
                cur_part = {"title": title, "mode": mode, "mods": []}
                parts.append(cur_part)
            elif line.startswith("### "):
                cur_q = None
                cur_mat = None
                if cur_part is None:
                    cur_part = {"title": "", "mode": "comp", "mods": []}
                    parts.append(cur_part)
                cur_mod = {"title": line[4:].strip(), "questions": []}
                cur_part["mods"].append(cur_mod)
            elif line.startswith("**（材料）**"):
                cur_q = None
                mat_seq += 1
                cur_mat = {"id": "mat%d" % mat_seq, "title": line.replace("**（材料）**", "").strip(),
                           "rows": [], "html": None}
            elif line.startswith("**"):
                m = re.match(r"^\*\*(\d+)\.（(单选|多选|问答)）\*\*\s*(.*)$", line)
                if m:
                    cur_q = {"no": int(m.group(1)), "type": m.group(2),
                             "text": m.group(3), "opts": [], "ans": None, "note": "",
                             "mat": cur_mat}
                    if cur_mod is None:
                        cur_mod = {"title": "", "questions": []}
                        if cur_part is None:
                            cur_part = {"title": "", "mode": "comp", "mods": []}
                            parts.append(cur_part)
                        cur_part["mods"].append(cur_mod)
                    cur_mod["questions"].append(cur_q)
                    continue
            if cur_q is not None:
                om = re.match(r"^-\s*([A-E])\.\s*(.*)$", line)
                if om:
                    cur_q["opts"].append((om.group(1), om.group(2)))
                    continue
                am = re.match(r"^>\s*答案：\s*(.+)$", line)
                if am:
                    cur_q["ans"] = am.group(1).strip()
                    continue
                nm = re.match(r"^>\s*(?:解析|参考要点)：\s*(.*)$", line)
                if nm:
                    cur_q["note"] = nm.group(1).strip()
                    continue
            if cur_mat is not None and line.lstrip().startswith("|"):
                cur_mat["rows"].append(line)
    # 生成材料 HTML（挂在首个引用该材料的题目上；由 render_set 控制只渲染一次）
    for pt in parts:
        for mod in pt["mods"]:
            for q in mod["questions"]:
                if q.get("mat") and q["mat"]["html"] is None and q["mat"]["rows"]:
                    q["mat"]["html"] = "<p class=\"mat-title\">%s</p>\n%s" % (
                        q["mat"]["title"], md_table_to_html(q["mat"]["rows"]))
    return parts

def render_question(q, offset, mat_html=""):
    no = q["no"] + offset
    if q["type"] == "问答":
        return ('<div class="qa-essay">\n'
                '<p class="q-line"><span class="q-no">%d.</span>'
                '<span class="q-badge q-essay-badge">\u270e \u95ee\u7b54</span>%s</p>\n'
                '<div class="essay-area">\n'
                '<textarea placeholder="\u5728\u6b64\u4f5c\u7b54\uff08\u4e3b\u89c2\u9898\uff0c\u7b54\u540e\u53ef\u5bf9\u7167\u53c2\u8003\u8981\u70b9\u81ea\u8bc4\uff09"></textarea>\n'
                '<div class="essay-actions"><button type="button" class="qa-btn qa-btn-essay">\u67e5\u770b\u53c2\u8003\u7b54\u6848</button></div>\n'
                '<div class="essay-ref" style="display:none"><strong>\u53c2\u8003\u7b54\u6848\u8981\u70b9\uff1a</strong>%s</div>\n'
                '</div>\n</div>') % (no, q["text"], q["note"])
    badge = ('<span class="q-badge q-single">\u2b1c \u5355\u9009</span>'
             if q["type"] == "单选"
             else '<span class="q-badge q-multi">\u2611 \u591a\u9009</span>')
    mat = ('<div class="mat-block">\n%s\n</div>\n' % mat_html) if mat_html else ""
    lis = "\n".join('<li><span class="opt-key">%s.</span>%s</li>' % (k, t) for k, t in q["opts"])
    return ('<div class="question">\n'
            '%s'
            '<p class="q-line"><span class="q-no">%d.</span>%s%s</p>\n'
            '<ul class="options">\n%s\n</ul>\n</div>') % (mat, no, badge, q["text"], lis)

def render_answer_table(parts, set_idx, offset, set_name):
    rows = []
    for part in parts:
        for mod in part["mods"]:
            for q in mod["questions"]:
                if q["type"] == "问答":
                    rows.append('<tr>\n<td class="qid">%d</td>\n<td class="ans">\u53c2\u8003\u8981\u70b9</td>\n<td>%s</td>\n</tr>'
                                % (q["no"] + offset, q["note"]))
                else:
                    rows.append('<tr>\n<td class="qid">%d</td>\n<td class="ans">%s</td>\n<td>%s</td>\n</tr>'
                                % (q["no"] + offset, q["ans"], q["note"]))
    first = parts[0]["mods"][0]["questions"][0]["no"] + offset if parts and parts[0]["mods"] else 1
    last = first + len(rows) - 1
    return ('<table class="answer-table">\n'
            '<caption>参考答案 · %s（题号 %d\u2013%d）</caption>\n'
            '<thead><tr>\n<th>\u9898\u53f7</th>\n<th>\u7b54\u6848</th>\n<th>\u7b80\u6790</th>\n</tr></thead>\n'
            '<tbody>\n%s\n</tbody>\n</table>') % (set_name, first, last, "\n".join(rows))

def render_set(idx, parts, per_set, essay, set_name):
    unit = per_set + essay
    offset = idx * unit
    sec = ['<section role="set%d" data-margin-top="2.5" data-margin-bottom="2.0" data-margin-left="2.5" data-margin-right="2.5">'
           % (idx + 1),
           '<h2 id="sec-set%d" class="set-heading">%s</h2>' % (idx + 1, set_name),
           '<p class="set-lead">本套共 %d 题（客观题 %d + 问答题 %d），建议限时 90 分钟。</p>' % (per_set + essay, per_set, essay)]
    last_mat = None
    for pi, part in enumerate(parts):
        if pi > 0:
            sec.append('<hr style="border:none;border-top:1px solid var(--color-divider);margin:2em 0"/>')
        sec.append('<h3>%s</h3>' % part["title"])
        if part["mods"] and part["mods"][0]["questions"] and part["mods"][0]["questions"][0]["type"] == "问答":
            sec.append('<p class="part-lead">请结合岗位实际作答；作答后可点击「查看参考答案」对照要点自评（主观题不计入得分统计）。</p>')
        else:
            sec.append('<p class="part-lead">请从每题的备选项中选出最符合题意的一项或多项；多选题漏选、错选均不得分。</p>')
        for mod in part["mods"]:
            if mod["title"]:
                sec.append('<h4>%s</h4>' % mod["title"])
            for q in mod["questions"]:
                mat_html = ""
                if q.get("mat") and q["mat"].get("html") and q["mat"] is not last_mat:
                    mat_html = q["mat"]["html"]
                    last_mat = q["mat"]
                sec.append(render_question(q, offset, mat_html))
    sec.append('</section>')
    return "\n".join(sec)

def main():
    ap = argparse.ArgumentParser(description="生成模拟题库练习版 HTML")
    ap.add_argument("--name", required=True, help="岗位名（封面/标题）")
    ap.add_argument("--org", default="", help="单位名称（封面，可选）")
    ap.add_argument("--difficulty", default="中等", help="难度：简单/中等/困难")
    ap.add_argument("--sets", type=int, default=3, help="套数")
    ap.add_argument("--per-set", type=int, default=50, help="每套总题数（客观题）")
    ap.add_argument("--comp", type=int, default=25, help="每套综合能力题数（不含资料分析）")
    ap.add_argument("--prof", type=int, default=25, help="每套专业能力题数")
    ap.add_argument("--data-groups", type=int, default=0, help="每套资料分析材料组数（表格数据分析，默认 0 = 不加；每组配 4~5 道单选或多选）")
    ap.add_argument("--data-per-group", type=int, default=4, help="每组资料分析题数基准（4 或 5，默认 4）")
    ap.add_argument("--store-key", default="gps_qa_mock", help="localStorage 存储 key（不同题库用不同 key）")
    ap.add_argument("--essay", type=int, default=0, help="每套问答题数（主观题，附参考要点）")
    ap.add_argument("--input-dir", required=True, help="题库数据目录（set1.md, set2.md...）")
    ap.add_argument("--out", required=True, help="输出 HTML 路径")
    ap.add_argument("--note", default="", help="编制说明附加文本（可选）")
    args = ap.parse_args()

    if args.data_per_group not in (4, 5):
        sys.exit("错误：--data-per-group 仅支持 4 或 5")
    unit = args.per_set + args.essay

    # 资源路径（本脚本位于 skill/scripts/，资源在 skill/assets/）
    here = os.path.dirname(os.path.abspath(__file__))
    assets = os.path.normpath(os.path.join(here, "..", "assets"))

    # 1. 解析各套
    all_parts = []
    data_total = 0
    for i in range(args.sets):
        p = os.path.join(args.input_dir, "set%d.md" % (i + 1))
        if not os.path.exists(p):
            sys.exit("缺少数据文件: %s" % p)
        parts = parse_set(p)
        qcount = sum(len(m["questions"]) for pt in parts for m in pt["mods"])
        if qcount != unit:
            sys.exit("%s 题数 %d != per-set+essay %d" % (p, qcount, unit))
        # 资料分析统计（有材料引用的客观题；材料组 = 去重后的材料块）
        data_qs = [q for pt in parts for m in pt["mods"] for q in m["questions"]
                   if q["type"] != "问答" and q.get("mat") is not None]
        mat_ids = []
        for q in data_qs:
            if q["mat"]["id"] not in mat_ids:
                mat_ids.append(q["mat"]["id"])
        if args.data_groups:
            if len(mat_ids) != args.data_groups:
                sys.exit("%s 材料组数 %d != --data-groups %d" % (p, len(mat_ids), args.data_groups))
            # 每组题数应在 [data_per_group, data_per_group+1]
            per_group = {}
            for q in data_qs:
                per_group[q["mat"]["id"]] = per_group.get(q["mat"]["id"], 0) + 1
            for mid, n in per_group.items():
                if not (args.data_per_group <= n <= args.data_per_group + 1):
                    sys.exit("%s 材料组 %s 配题数 %d 不在 %d~%d 范围" % (p, mid, n, args.data_per_group, args.data_per_group + 1))
        else:
            if len(mat_ids) != 0:
                sys.exit("%s 出现材料块但未启用 --data-groups（或与 per-set 不一致）" % p)
        if args.comp + args.prof + len(data_qs) != args.per_set:
            sys.exit("错误：comp(%d) + prof(%d) + 资料分析(%d) != per-set(%d)" % (args.comp, args.prof, len(data_qs), args.per_set))
        data_total += len(data_qs)
        all_parts.append(parts)
        print("parse %s -> %d 题（客观 %d + 问答 %d，资料分析 %d 题 / %d 组）"
              % (os.path.basename(p), qcount, args.per_set, args.essay, len(data_qs), len(mat_ids)))

    # 2. 组装 body
    slug = re.sub(r"[^\w\u4e00-\u9fff]", "", args.name)
    title = "%s模拟题库" % args.name
    if args.difficulty != "中等":
        title += "（%s难度）" % args.difficulty

    s_essay = "+ 问答 %d" % args.essay if args.essay else ""
    s_data = "，其中资料分析 %d 组 × 每组 %d~%d 题" % (args.data_groups, args.data_per_group, args.data_per_group + 1) if args.data_groups else ""
    s_type = "+ 资料分析" if args.data_groups else ""
    comp_total = args.comp + (data_total // args.sets if args.sets else 0)
    cover = """<section role="cover" class="cover" data-margin-top="2.5" data-margin-bottom="2.0" data-margin-left="2.5" data-margin-right="2.5">
  <p class="cover-eyebrow" style="text-align: center;">%s%s</p>
  <h1 class="cover-title" style="text-align: center;">%s</h1>
  <p class="cover-subtitle" style="text-align: center;">综合能力测试 + 专业能力测试 · %d 套 · %d 题 · 参考答案附后</p>
  <p class="cover-meta" style="text-align: center;">难度：%s　｜　题型：单选题 + 多选题%s%s</p>
  <p class="cover-meta" style="text-align: center;">结构：%d 套 × %d 题（综合 %d + 专业 %d%s%s）</p>
  <p class="cover-meta" style="text-align: center;">建议单套限时 90 分钟</p>
  <p class="cover-note" style="text-align: center;">内部复习资料 · 模拟演练使用</p>
</section>""" % (args.org + " · " if args.org else "", args.name, title,
                args.sets, args.sets * unit, args.difficulty,
                s_essay, s_type, args.sets, args.per_set,
                comp_total, args.prof, s_data, s_essay)

    toc_items = (
        '<li><a href="#sec-brief">编制说明（题库速览）</a></li>\n' +
        "".join('<li><a href="#sec-set%d">第%d套模拟题</a></li>\n' % (i + 1, i + 1) for i in range(args.sets)) +
        '<li><a href="#sec-answers">参考答案（最后一页）</a></li>')

    body_head = """<section role="body" data-page-restart="1" data-margin-top="2.5" data-margin-bottom="2.0" data-margin-left="2.5" data-margin-right="2.5">
  <nav class="doc-toc" aria-label="文档目录">
    <p class="toc-title">目录</p>
    <ol class="toc-list">
%s
    </ol>
  </nav>
  <div class="executive-summary">
    <h2 id="sec-brief">编制说明 <span class="summary-badge">Question Bank Brief</span></h2>
    <div class="summary-body">
<p>本套题库针对%s岗位笔试复习，题目以<strong>单选题 + 多选题%s</strong>为主，<strong>难度：%s</strong>。</p>
<table class="brief-table">
<caption>题库结构总览</caption>
<thead><tr>
<th>维度</th>
<th>占比</th>
<th>题型</th>
<th>涉及知识点</th>
</tr></thead>
<tbody>
<tr><td>综合能力测试</td><td>%d%%</td><td>单选 + 多选%s</td><td>常识判断（时政/历史/地理/文化/科技/法律/经济/生活等）、言语理解、数量关系、判断推理、策略选择%s</td></tr>
<tr><td>专业能力测试</td><td>%d%%</td><td>单选 + 多选</td><td>岗位专业知识（按岗位编制）</td></tr>
</tbody></table>
<p><strong>结构</strong>：%d 套 × %d 客观题 + %d 问答题 = <strong>%d 题</strong>（其中资料分析 %d 组 × %d 题），最后一页附完整参考答案（含简析与问答题参考要点）。建议单套限时 90 分钟。</p>
<p class="section-lead">答题进度自动保存，可随时继续；综合能力测试按事业单位《职业能力倾向测验》常见偏向出题，覆盖面广、难度适中。%s</p>
    </div>
  </div>
</section>""" % (toc_items, args.name, s_type, args.difficulty,
                round(comp_total / args.per_set * 100),
                s_type,
                "、资料分析（表格数据计算）" if args.data_groups else "",
                round(args.prof / args.per_set * 100),
                args.sets, args.per_set, args.essay, args.sets * unit,
                args.data_groups, args.data_per_group,
                args.note)

    set_names = ["第%d套模拟题" % (i + 1) for i in range(args.sets)]
    sets_html = "\n".join(render_set(i, all_parts[i], args.per_set, args.essay, set_names[i])
                          for i in range(args.sets))

    answers = ['<section role="answers" data-margin-top="2.5" data-margin-bottom="2.0" data-margin-left="2.5" data-margin-right="2.5">',
               '  <h2 id="sec-answers" class="set-heading">参考答案（最后一页）</h2>',
               '  <p class="set-lead">本部分为各套模拟题的标准答案与简析，按套号分块排列，对照题号即可快速核对；问答题附参考要点。</p>']
    for i, parts in enumerate(all_parts):
        answers.append('<h3>第%d套（题号 %d\u2013%d）</h3>'
                       % (i + 1, i * unit + 1, (i + 1) * unit))
        answers.append(render_answer_table(parts, i, i * unit, set_names[i][:2]))
    answers.append('</section>')
    answers_html = "\n".join(answers)

    body = cover + "\n" + body_head + "\n" + sets_html + "\n" + answers_html

    # 3. 组装最终 HTML（复用 base-head 版式 + 交互 JS）
    head = io.open(os.path.join(assets, "base-head.html"), encoding="utf-8").read().replace("{TITLE}", title)
    js = io.open(os.path.join(assets, "qa-interact.js"), encoding="utf-8").read()
    assert "</script>" not in js
    store_script = "<script>window.__QA_STORE_KEY__='%s';</script>" % args.store_key

    final = ("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n"
             + head + "\n<body>\n" + body + "\n"
             + store_script + "\n"
             + "<script>\n" + js + "\n</script>\n</body>\n</html>\n")

    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(final)
    print("生成完成:", args.out)
    print("大小:", len(final.encode("utf-8")), "bytes | 题目总数:", args.sets * unit, "| 资料分析:", data_total)

if __name__ == "__main__":
    main()
