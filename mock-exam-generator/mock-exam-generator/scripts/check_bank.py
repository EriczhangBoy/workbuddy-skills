#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_bank.py — 题库自检（mock-exam-generator skill）

用法：
  python3 check_bank.py --input-dir ./bank --sets 3 --per-set 58 --comp 25 --prof 25 --data-groups 2 \
    --banned "给水,污水,水厂,滤池,污泥,BOD,COD,曝气,泵,管网"

校验项：
  1) 每套题数 = per-set；综合（含资料分析）= comp + 资料题数、专业 = prof
  2) 每题都有答案与解析
  3) 答案字母全部在选项中
  4) 单选题答案唯一（长度为 1）；多选题答案 ≥ 2
  5) 综合能力部分（第一部分）不含 --banned 专业词（含资料分析材料块文本）
  6) 每套内题号 1..per_set 连续且无重复
  7) 资料分析（--data-groups>0）：材料组数 = data-groups；每组配题数在 data-per-group ~ +1 之间；
     资料分析题（引用材料块的题）可为单选或多选，走通用校验
通过 exit 0，失败 exit 1 并输出问题清单。
"""
import argparse, io, os, re, sys

def parse_set(path):
    parts = []
    cur_part = None
    cur_mod = None
    cur_q = None
    cur_mat = None
    with io.open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if line.startswith("## "):
                cur_q = None
                cur_mat = None
                cur_part = {"title": line[3:].strip(), "mode": "prof" if "专业" in line else "comp", "mods": []}
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
                cur_mat = {"title": line.replace("**（材料）**", "").strip(), "rows": []}
            elif line.startswith("**"):
                m = re.match(r"^\*\*(\d+)\.（(单选|多选|问答)）\*\*\s*(.*)$", line)
                if m:
                    cur_q = {"no": int(m.group(1)), "type": m.group(2), "text": m.group(3),
                             "opts": [], "ans": None, "note": "", "mat": cur_mat}
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
    return parts

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-dir", required=True)
    ap.add_argument("--sets", type=int, default=3)
    ap.add_argument("--per-set", type=int, default=50)
    ap.add_argument("--comp", type=int, default=25)
    ap.add_argument("--prof", type=int, default=25)
    ap.add_argument("--data-groups", type=int, default=0, help="每套资料分析材料组数（默认 0 = 不加；每组配 4~5 道单选或多选）")
    ap.add_argument("--data-per-group", type=int, default=4, help="每组资料分析题数基准（4 或 5，默认 4）")
    ap.add_argument("--banned", default="", help="综合区禁用专业词，逗号分隔")
    ap.add_argument("--essay", type=int, default=0, help="每套问答题数（主观题，不计入综合/专业客观题）")
    args = ap.parse_args()

    if args.data_per_group not in (4, 5):
        sys.exit("参数错误：--data-per-group 仅支持 4 或 5")

    banned = [w.strip() for w in args.banned.split(",") if w.strip()]
    errors = []

    for i in range(args.sets):
        p = os.path.join(args.input_dir, "set%d.md" % (i + 1))
        if not os.path.exists(p):
            errors.append("缺少数据文件: %s" % p)
            continue
        parts = parse_set(p)
        qs = [q for pt in parts for m in pt["mods"] for q in m["questions"]]
        obj_qs = [q for q in qs if q["type"] != "问答"]
        essay_qs = [q for q in qs if q["type"] == "问答"]
        data_qs = [q for q in obj_qs if q.get("mat") is not None]
        mat_groups = []
        for q in data_qs:
            if all(q["mat"] is not g for g in mat_groups):
                mat_groups.append(q["mat"])

        # 1) 题数（客观题 = per_set，问答题 = essay；资料题计入综合）
        if len(qs) != args.per_set + args.essay:
            errors.append("set%d 总题数 %d != %d（客观%d + 问答%d）" % (i + 1, len(qs), args.per_set + args.essay, args.per_set, args.essay))
        comp_n = len([q for pt in parts if pt["mode"] == "comp" for m in pt["mods"] for q in m["questions"] if q["type"] != "问答"])
        prof_n = len([q for pt in parts if pt["mode"] == "prof" for m in pt["mods"] for q in m["questions"] if q["type"] != "问答"])
        if comp_n != args.comp + len(data_qs):
            errors.append("set%d 综合题数 %d != %d（含资料分析 %d 题）" % (i + 1, comp_n, args.comp + len(data_qs), len(data_qs)))
        if prof_n != args.prof:
            errors.append("set%d 专业题数 %d != %d" % (i + 1, prof_n, args.prof))

        # 2) 客观题：答案/解析齐全；3) 答案在选项内；4) 单选唯一/多选>=2
        for q in obj_qs:
            tag = "set%d Q%d" % (i + 1, q["no"])
            if not q["ans"]:
                errors.append("%s 缺答案" % tag)
            if not q["note"]:
                errors.append("%s 缺解析" % tag)
            keys = [k for k, _ in q["opts"]]
            if len(keys) != len(set(keys)):
                errors.append("%s 选项重复" % tag)
            if q["ans"]:
                for k in q["ans"]:
                    if k not in keys:
                        errors.append("%s 答案 %s 不在选项中" % (tag, k))
                if q["type"] == "单选" and len(q["ans"]) != 1:
                    errors.append("%s 单选题答案不唯一: %s" % (tag, q["ans"]))
                if q["type"] == "多选" and len(q["ans"]) < 2:
                    errors.append("%s 多选题答案过少: %s" % (tag, q["ans"]))

        # 2b) 问答题：必须含参考要点
        for q in essay_qs:
            if not q["note"]:
                errors.append("set%d Q%d 问答题缺参考要点" % (i + 1, q["no"]))

        # 2c) 资料分析：材料组数 = data-groups；每组配题数在 [data-per-group, +1]；材料表格 ≥2 行
        if args.data_groups:
            if len(mat_groups) != args.data_groups:
                errors.append("set%d 材料组数 %d != %d" % (i + 1, len(mat_groups), args.data_groups))
            per_group = {}
            for q in data_qs:
                if q["mat"] is None:
                    continue
                per_group[id(q["mat"])] = per_group.get(id(q["mat"]), 0) + 1
            for gid, n in per_group.items():
                if not (args.data_per_group <= n <= args.data_per_group + 1):
                    errors.append("set%d 某材料组配题数 %d 不在 %d~%d 范围（每组 4~5 题）"
                                  % (i + 1, n, args.data_per_group, args.data_per_group + 1))
            for q in data_qs:
                if not q.get("mat") or not q["mat"].get("rows") or len(q["mat"]["rows"]) < 2:
                    errors.append("set%d Q%d 资料题缺材料表格（需表头 + 分隔行 + 数据行）" % (i + 1, q["no"]))
        else:
            if data_qs:
                errors.append("set%d 出现资料分析材料/题目但未启用 --data-groups" % (i + 1))

        # 5) 综合区不含专业词（客观题 + 材料块文本）
        for pt in parts:
            if pt["mode"] != "comp":
                continue
            for m in pt["mods"]:
                for q in m["questions"]:
                    if q["type"] == "问答":
                        continue
                    text = q["text"] + "".join(t for _, t in q["opts"])
                    if q.get("mat") is not None:
                        text += q["mat"]["title"] + "".join(q["mat"]["rows"])
                    for w in banned:
                        if w in text:
                            errors.append("set%d Q%d 综合区混入专业词「%s」" % (i + 1, q["no"], w))

        # 6) 题号连续（1..per_set+essay）
        nos = [q["no"] for q in qs]
        if nos != list(range(1, args.per_set + args.essay + 1)):
            errors.append("set%d 题号不连续: %s..." % (i + 1, sorted(nos)[:6]))

    if errors:
        print("!! 题库自检失败，共 %d 项问题：" % len(errors))
        for e in errors[:40]:
            print("  -", e)
        if len(errors) > 40:
            print("  ... 等共 %d 项" % len(errors))
        sys.exit(1)
    s_data = " + 资料分析 %d 组" % args.data_groups if args.data_groups else ""
    print("OK: 题库自检通过（%d 套 × %d 客观题 + %d 问答%s，综合区无专业词）"
          % (args.sets, args.per_set, args.essay, s_data))

if __name__ == "__main__":
    main()
