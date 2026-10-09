# WorkBuddy Skills 仓库

本仓库用于存放本人 WorkBuddy（AI 助手）的**可复用技能包（Skill）**。每个技能一个子文件夹，内含分发包（zip）与使用说明；后续新增技能按同样方式扩展。

## 这是什么

Skill 是 WorkBuddy 的扩展能力包：一段"工作流程 + 规则 + 模板资源"（SKILL.md + scripts + assets + references）。安装到 `~/.workbuddy/skills/` 后，新会话中 AI 就能按固定流程复现某个任务——比如"给任意岗位生成带交互的模拟题库 HTML"。

## 仓库结构

```
workbuddy-skills/
├── README.md                          ← 本文件：总览与使用说明
└── mock-exam-generator/               ← 技能 1：模拟题库生成器
    ├── README.md                      ← 该技能的使用说明 + 变更记录
    ├── mock-exam-generator/           ← 未压缩源文件（可读可改，维护的唯一入口）
    └── mock-exam-generator.zip        ← 分发包（由未压缩目录重新生成，勿手改）
```

**维护铁律：以每个技能文件夹下的「同名未压缩目录」为唯一内容源**，zip 一律由它重新打包生成（`cd 技能名 && zip -r -X 技能名.zip 技能名/`，排除 `.DS_Store`），禁止直接编辑 zip，保证两者永远一致。

## 如何安装一个技能

1. 下载对应子文件夹下的 `xxx.zip`；
2. 解压到 WorkBuddy 用户技能目录：

```bash
mkdir -p ~/.workbuddy/skills
unzip xxx.zip -d ~/.workbuddy/skills/
```

（解压后结构应为 `~/.workbuddy/skills/xxx/SKILL.md`）

3. 新开 WorkBuddy 对话，直接说触发词（如"给 xx 岗位生成模拟题"）即可使用。

## 如何新增一个技能（仓库维护约定）

1. 在仓库根目录新建 `技能名/` 文件夹，内含三部分：
   - `README.md`：说明（是什么、怎么用、参数、输出）+ **变更记录**（changelog，每次更新追加）；
   - `技能名/`：未压缩源文件（`SKILL.md` + scripts + assets + references 等）；
   - `技能名.zip`：分发包（由未压缩目录生成，命令见上）。
2. 更新该技能 `README.md` 的变更记录；若为全新技能，初始版本记 v1.0 与创建日期；
3. 更新下方"技能列表"表格；
4. commit & push（远程 URL 不带凭据，凭据走系统钥匙串）。

## 技能列表

| 技能 | 功能 | 说明 |
| --- | --- | --- |
| [mock-exam-generator](mock-exam-generator/README.md) | 为指定岗位生成交互式模拟题库 HTML（综合 50% + 专业 50%；判题/复习模式/错题清单/进度保存/手机适配） | [使用说明](mock-exam-generator/README.md) |

## 安全说明

- 本仓库技能包均为自产模板，不含任何密钥/凭据/内网信息。
- 安装任何第三方技能前，请先对其内容进行安全检查。
