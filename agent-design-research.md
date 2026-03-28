# Agent 设计最佳实践研究报告

> 基于 Anthropic、LangChain、OpenAI 三大顶级 AI 公司的工程博客、官方文档和实战经验，对比 Loomic 现有 Agent 架构，提炼关键设计原则和改进方向。
>
> 日期：2026-03-27

---

## 目录

- [第一部分：行业最佳实践综合](#第一部分行业最佳实践综合)
  - [1. Agent 设计核心哲学](#1-agent-设计核心哲学)
  - [2. Agent 架构模式全景](#2-agent-架构模式全景)
  - [3. 提示词工程](#3-提示词工程)
  - [4. 工具设计](#4-工具设计)
  - [5. 多 Agent 协作](#5-多-agent-协作)
  - [6. Context Engineering（上下文工程）](#6-context-engineering上下文工程)
  - [7. 状态管理与记忆](#7-状态管理与记忆)
  - [8. 流式输出与异步处理](#8-流式输出与异步处理)
  - [9. 安全与 Guardrails](#9-安全与-guardrails)
  - [10. Agent 评估体系](#10-agent-评估体系)
- [第二部分：Loomic 现有架构深度分析](#第二部分loomic-现有架构深度分析)
- [第三部分：Gap 分析与改进建议](#第三部分gap-分析与改进建议)
- [附录：关键文章索引](#附录关键文章索引)

---

## 第一部分：行业最佳实践综合

### 1. Agent 设计核心哲学

三家公司虽然侧重点不同，但在核心哲学上高度一致：

#### 1.1 Anthropic：从简单到复杂的渐进原则

Anthropic 在 *Building Effective Agents* (2024-12) 中提出最核心的主张：

> **"不要默认使用 Agent——先优化单次 LLM 调用（加 retrieval + in-context examples），只有当简单方案明确不足时才引入多步骤系统。"**

三大实现原则：
- **Simplicity（简洁）**：减少复杂度和维护负担
- **Transparency（透明）**：通过可视化规划步骤建立信任
- **ACI Excellence（Agent-Computer Interface 卓越性）**：工具文档和测试要像 HCI 一样严谨

关键区分——**Workflow vs Agent**：
| 维度 | Workflow | Agent |
|------|----------|-------|
| 控制流 | 预定义代码路径编排 | LLM 自主决定 |
| 可预测性 | 强 | 弱 |
| 适用场景 | 定义明确的任务 | 需要模型驱动决策的场景 |
| 调试难度 | 低 | 高 |

#### 1.2 LangChain：Agentic 频谱

Harrison Chase 给出的 Agent 技术定义：

> **"AI Agent 是一个使用 LLM 来决定应用程序控制流(control flow)的系统。"**

但他引用 Andrew Ng 的观点：不要争论什么是"真正的 agent"，系统有不同程度的 **agentic**（代理性），类似自动驾驶分级：

| 层级 | 名称 | 描述 | LLM 决定权 |
|------|------|------|-----------|
| L1 | Router | LLM 将输入路由到特定下游工作流 | 最小 |
| L2 | Multi-step Router | 多个 LLM 执行多步路由 | 低 |
| L3 | State Machine | 某一步决定是继续还是结束，允许循环 | 中 |
| L4 | Autonomous Agent | 自行构建工具、记住工具、未来使用 | 最大 |

核心洞察——越 agentic：
- 越需要编排框架（支持 branching logic 和 cycles）
- 越难运行（需要 background runs 和 durable execution）
- 越需要运行时交互（观察内部步骤、修改状态）
- 越需要专用评估框架（测试中间步骤而非仅最终输出）
- 越需要新型监控框架（深入钻取所有步骤）

#### 1.3 OpenAI：Harness Engineering

来自 Codex 团队的核心转变：

> **"工程团队的主要工作不再是写代码，而是设计环境、表达意图、构建反馈循环让 agent 可靠工作。"**

四大基础构建块：
| 构建块 | 说明 |
|--------|------|
| **Models** | 推理型（o1/o3）vs 非推理型（gpt-5.4），按任务复杂度选择 |
| **Tools** | 自定义 function calling + 内置工具 |
| **State/Memory** | 短期（Session Trimming/Summarization）+ 长期（Global Memory Notes） |
| **Orchestration** | 管理对话流、多步骤、tool use、agent handoffs |

#### 1.4 三家共识总结

```
┌─────────────────────────────────────────────────────────────┐
│                   三家公司共识                                │
├─────────────────────────────────────────────────────────────┤
│ 1. 从简单开始，只在必要时增加复杂度                            │
│ 2. 工具设计的重要性等同于（甚至超过）提示词设计                  │
│ 3. 评估驱动迭代，而非直觉驱动                                 │
│ 4. Context 是稀缺资源，必须精心管理                           │
│ 5. 安全不是附加项，是基础设施                                  │
│ 6. 多 Agent 不一定比单 Agent 好——取决于任务分解是否合理          │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Agent 架构模式全景

综合三家公司的实践，Agent 架构模式可分为以下层次：

#### 2.1 基础模式

**模式 1: Augmented LLM（增强型 LLM）** — Anthropic

最基础的构建块。通过 retrieval、tools、memory 增强基础模型。重点是针对用例定制和清晰接口。所有更复杂模式都基于此。

**模式 2: Prompt Chaining（提示链）** — Anthropic

将任务分解为顺序步骤，每步 LLM 调用处理前一步输出，中间加入 programmatic gates。**以延迟换取准确度**。

```
Step 1 → Gate → Step 2 → Gate → Step 3 → Output
```

**模式 3: Routing（路由）** — Anthropic / OpenAI

对输入分类后导向专门处理路径。OpenAI 的 Triaging Agent 使用 structured output 路由到下游 agent。

```
Input → Classifier → Path A (专门处理)
                   → Path B (专门处理)
                   → Path C (专门处理)
```

#### 2.2 并行与迭代模式

**模式 4: Parallelization（并行化）** — Anthropic

两种变体：
- **Sectioning**：独立子任务拆分并行执行
- **Voting**：同一任务运行多次获取多样化输出

**模式 5: Evaluator-Optimizer（评估者-优化器）** — Anthropic

迭代优化循环：一个 LLM 生成响应，另一个提供评估反馈。类似人类编辑流程。

```
Generator → Evaluator → [pass?] → Output
    ↑           |
    └── feedback ┘
```

**模式 6: Reflection（反思）** — LangChain

三个层次的反思：
1. **Basic Reflection**：Generator + Reflector 循环
2. **Reflexion**：Actor agent 基于外部数据验证批评
3. **LATS（Language Agent Tree Search）**：Monte-Carlo 树搜索 + 反思，探索多条路径

```
                    ┌─ Path A → Reflect → Score
start → expand ─────┼─ Path B → Reflect → Score  → Backpropagate → Best Path
                    └─ Path C → Reflect → Score
```

#### 2.3 编排模式

**模式 7: Orchestrator-Workers（编排者-工人）** — Anthropic / OpenAI

中央 LLM 动态分解任务并委派给 worker LLM。Anthropic 的 Research 功能实际架构：

```
LeadResearcher (Opus 4)
  ├── Subagent 1 (Sonnet 4) → Web Search → 返回精炼摘要
  ├── Subagent 2 (Sonnet 4) → Web Search → 返回精炼摘要
  └── Subagent 3 (Sonnet 4) → Web Search → 返回精炼摘要
  │
  └── CitationAgent → 确保来源支撑
```

关键性能数据：多 agent（Opus 4 lead + Sonnet 4 subagents）在内部研究 eval 上**比单 agent Opus 4 高出 90.2%**。

**模式 8: Agent Supervisor（监督者）** — LangChain

Supervisor 本质上是一个"其 tools 是其他 agents"的 agent：

```
User → Supervisor → Agent A (独立 scratchpad + tools)
                  → Agent B (独立 scratchpad + tools)
       ↑ global scratchpad ← final responses 追加
```

**模式 9: Hierarchical Teams（层级团队）** — LangChain

节点中的 agent 本身是其他 LangGraph 对象（而非 AgentExecutor），支持多层级嵌套。

**模式 10: Routines and Handoffs（例程与交接）** — OpenAI

Routine = 自然语言指令列表 + 必要工具。Handoff = agent 间的对话转移，保留完整对话历史。

```python
# OpenAI Handoff 模式
def transfer_to_billing_agent():
    """Transfer conversation to billing specialist."""
    return billing_agent  # 返回 Agent 对象触发切换
```

#### 2.4 规划模式

**模式 11: Plan-and-Execute** — LangChain

将 LLM "planner" 与 tool execution runtime 分离：
- **更快**：子任务可无需额外 LLM 调用
- **更省**：子任务可用更小的领域模型
- **更好**：强制显式"思考"所有步骤

```
Planner → Executor (step 1) → Executor (step 2) → Re-planner → [done?] → END
```

**模式 12: LLMCompiler** — LangChain

将任务组织为 DAG（有向无环图），实现最大并行度（论文声称 3.6x 加速）：

```
Planner (stream DAG) → Task Fetching Unit (并行调度) → Joiner → [replan?] → END
```

**模式 13: Generator-Evaluator 循环（GAN 启发）** — Anthropic

三 Agent 系统用于长期运行的应用开发：
- **Planner Agent**：将简短 prompt 扩展为完整产品规格
- **Generator Agent**：按 sprint 实现功能
- **Evaluator Agent**：通过 Playwright 像最终用户一样测试

核心发现：模型的自我评估能力很差——"被要求评估自己的作品时，agent 倾向于自信地赞扬"。**分离评估和生成比让生成者自我批判更有效**。

---

### 3. 提示词工程

#### 3.1 System Prompt 结构设计

**OpenAI 推荐结构**：
```
# Role and Objective（角色与目标）
# Instructions（指令）
## Sub-categories（细分类别）
# Reasoning Steps（推理步骤）
# Output Format（输出格式）
# Examples（示例）
# Context（上下文）
# Final Instructions（最终指令）
```

**Anthropic 推荐**：
- 用 XML 标签或 Markdown 标题组织不同段落
- 区分：`background_information`, `instructions`, `tool_guidance`, `output_description`
- **从最小 prompt 开始**，在最好的模型上测试，基于失败模式迭代添加指令

#### 3.2 Agentic Prompt 三大关键提醒（OpenAI GPT-4.1）

这三条指令将 SWE-bench Verified 性能提升约 **20%**：

1. **Persistence（持久性）**：让模型理解它在多消息 turn 中运行，不应过早返回控制
2. **Tool-Calling（工具调用）**："如果不确定，使用工具查看，不要猜测"
3. **Planning（规划）**：在每次 function call 前广泛规划，在之后广泛反思

#### 3.3 提示词设计反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|----------|
| "always call a tool before responding" | 导致幻觉工具输入或 null 值 | "if you don't have enough info, ask the user" |
| 一个巨大的指令文件 | Context 稀缺时过多指导等于没有指导 | 将指令作为目录（~100行），指向更深层文档 |
| 过度复杂的硬编码逻辑 | 脆弱，不可泛化 | 直白语言在"正确的海拔高度"描述 |
| 全大写/贿赂激励 | 通常不需要，且不可靠 | 清晰、结构化的自然语言指令 |

#### 3.4 长上下文场景的特殊考量

- 指令放在上下文的**开头和结尾**效果最佳
- 仅放一次时，放在上下文**上方**优于下方
- XML 和 Markdown 在长上下文中优于 JSON 格式
- 文档格式推荐 XML：`<doc id='1' title='...'>content</doc>`

#### 3.5 Anthropic 的 Think Tool

一个轻量但高效的工具，为 agent 提供"思考暂停"：

```json
{
  "name": "think",
  "description": "Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log.",
  "input_schema": {
    "properties": {
      "thought": { "type": "string", "description": "A thought to think about." }
    },
    "required": ["thought"]
  }
}
```

性能数据：
- 航空客服场景：**54% 相对提升**
- SWE-Bench：平均提升 1.6%（p < .001）

最佳使用场景：处理工具输出后的分析、策略密集型环境中验证合规性、顺序决策中避免代价高昂的错误。

---

### 4. 工具设计

工具设计是三家公司一致认为**最被低估但最关键**的领域。

#### 4.1 Anthropic 的五大工具设计原则

**来源**: *Writing Effective Tools for Agents* (2025-09)

> **工具代表确定性系统与非确定性 agent 之间的契约——这与传统函数调用根本不同。**

**原则 1：选择正确的工具**
- 不是越多越好，要针对特定高影响工作流构建
- Context 效率：不要返回所有数据让 agent 逐 token 阅读，实现过滤和搜索
- 合并操作：`schedule_event`（查找空闲+安排）优于分开的三个函数

**原则 2：工具命名空间化**
- 用通用前缀分组：`asana_search`, `jira_search`
- 前缀 vs 后缀命名在不同 LLM 上有可测量的差异——需经验测试

**原则 3：返回有意义的上下文**
- 用 `name`, `image_url`, `file_type` 而非 `uuid`, `256px_image_url`, `mime_type`
- 将字母数字 UUID 解析为语义语言**"显著提高检索精度，减少幻觉"**

**原则 4：Token 效率优化**
- 实现分页、范围选择、过滤、截断，设置合理默认值
- 错误响应提供可操作指引：
  - 差："ValueError: invalid input"
  - 好："Date format must be YYYY-MM-DD. Example: 2025-01-15"

**原则 5：Prompt 工程化描述**
- 工具描述像**给新队友做入职培训**一样编写——让隐含上下文显式化
- 使用严格数据模型清晰描述输入/输出

#### 4.2 OpenAI 的工具设计实践

**函数定义**：
- 函数命名应直观表达用途
- 使用 enum 和 object 结构防止无效状态
- 应用 "intern test"：仅凭文档就能理解用法
- 使用 namespace 按领域分组

**减轻模型负担**：
- 不要让模型填充你已拥有的参数（通过闭包注入）
- 合并总是连续调用的函数
- 将逻辑卸载到应用代码中

**数量管理**：
- 初始可用函数控制在 **20 个以内**
- 大量或低频工具使用 `tool_search` 按需加载
- 工具过多时性能下降，使用专门的 agent 分组缓解

**Strict Mode**（强烈推荐始终启用）：
```json
{
  "strict": true,
  "parameters": {
    "type": "object",
    "required": ["all_fields"],
    "additionalProperties": false
  }
}
```

#### 4.3 高级工具使用模式

**Tool Search Tool（工具搜索工具）** — Anthropic

问题：5 个 MCP server 的工具定义约 55K token。

方案：标记 `defer_loading: true`，运行时按需发现。

效果：token 使用减少 **85%**，Opus 4 准确率从 49% 提升到 74%。

**Programmatic Tool Calling（代码式工具调用）** — Anthropic

Agent 通过写 Python 代码编排多工具，中间结果不进入 Claude context：

```typescript
// 文件系统式工具暴露
// ./servers/google-drive/getDocument.ts
export async function getDocument(input) {
  return callMCPTool('google_drive__get_document', input);
}
```

Token 使用**从 150,000 降至 2,000——节省 98.7%**。

**Tool Use Examples（工具使用示例）** — Anthropic

JSON schema 只定义结构有效性，无法传达使用模式。提供具体调用示例：准确率从 **72% 提升到 90%**。

#### 4.4 三阶段工具开发流程（Anthropic）

```
1. 构建原型 → 用 Claude Code + llms.txt 快速构建 MCP server
2. 运行综合评估 → 创建现实的多步骤评估 prompt（数十次工具调用）
3. 与 Agent 协作 → 将评估 transcript 粘贴给 Claude 分析并重构工具
```

---

### 5. 多 Agent 协作

#### 5.1 什么时候需要多 Agent

三家公司的共识：

| 场景 | 建议 |
|------|------|
| 任务可以清晰分解为独立子任务 | 多 Agent |
| 需要不同专业知识/不同 prompt/不同模型 | 多 Agent |
| 工具数量过多导致性能下降 | 多 Agent 分组 |
| 需要并行执行节省时间 | 多 Agent |
| 任务简单且线性 | 单 Agent |
| 子任务间高度耦合 | 单 Agent |

#### 5.2 Anthropic 多 Agent 实战经验

**八大 Prompt 策略**（来自 *How We Built Our Multi-Agent Research System*）：

1. **像 Agent 一样思考**：用完全相同的 prompt 和工具构建模拟，部署前发现失败模式
2. **教会编排**：给主 agent 清晰的子任务描述（目标、输出格式、工具指导、任务边界）
3. **按规模匹配工作量**：
   - 简单事实查找：1 个 agent（3-10 次调用）
   - 对比分析：2-4 个 subagent（各 10-15 次调用）
   - 复杂研究：10+ subagent
4. **工具设计至关重要**："Agent-tool interface 与 human-computer interface 同等重要"
5. **自我改进**：Claude 4 能诊断失败并建议 prompt 改进
6. **搜索策略**：先广后窄（模仿专家人类研究方式）
7. **Extended thinking**：用可见思考过程作为 scratchpad 进行规划和评估
8. **并行执行**：主 agent 同时启动 3-5 个 subagent，研究时间减少 **90%**

**并行 Agent 团队**（C 编译器项目）：

16 个 Claude Opus 实例自主构建 10 万行 Rust C 编译器。关键教训：
- 通过 Git 实现任务锁定机制
- 测试框架质量至关重要——"Claude 会自主解决任何给它的问题，所以任务验证器必须近乎完美"
- Context window 污染防护——将关键信息记录到文件让 Claude 选择性读取
- 时间盲区——需要打印进度信息并实现 `--fast` 选项

#### 5.3 LangChain 的三种协作拓扑

| 拓扑 | 特点 | 适用场景 |
|------|------|----------|
| **Collaboration** | 共享 scratchpad，所有 agent 互相可见 | 需要高度协调 |
| **Supervisor** | 独立 scratchpad，supervisor 路由 | 清晰的任务分工 |
| **Hierarchical** | 多层嵌套 LangGraph | 复杂的组织结构 |

#### 5.4 OpenAI 的并行执行方式

**方式一**：`asyncio.gather()` — 确定性、低延迟、更可定制

**方式二**：Agents as Tools + `parallel_tool_calls` — 动态工具选择、更方便但延迟更高

#### 5.5 Token 经济学

来自 Anthropic 的数据：
- 单 agent 使用的 token 是 chat 的 **4 倍**
- 多 agent 系统使用的 token 是 chat 的 **15 倍**
- C 编译器项目：2,000 次会话，20 亿输入 token，1.4 亿输出 token，总成本 **$20,000**
- 只有高价值任务才值得增加的性能消耗

---

### 6. Context Engineering（上下文工程）

Anthropic 在 *Effective Context Engineering for AI Agents* (2025-09) 中系统化了这一领域。

#### 6.1 核心定义

> **Context = 推理时提供给 LLM 的所有 token**
>
> **Context Engineering = 优化 token 效用以对抗 LLM 约束，追求一致的期望输出**

这是 Prompt Engineering 的自然演进——不仅是写好 system prompt，而是**在推理过程中策展和维护最优 token 集**。

#### 6.2 Context Rot（上下文腐烂）

随着 token 数量增加，模型准确回忆信息的能力下降：
- Transformer 中每个 token 关注所有其他 token（n² 关系）
- 序列越长，注意力越分散
- 训练数据分布偏向短序列

#### 6.3 有效 Context 的四大组件

| 组件 | 设计要点 |
|------|----------|
| **System Prompts** | 在"正确的海拔高度"使用直白语言；从最小 prompt 开始 |
| **Tools** | 定义 agent 与信息/动作空间的契约；返回 token 高效信息 |
| **Few-Shot Examples** | 不要穷举边缘案例，策展多样、规范的示例 |
| **Dynamic Context** | Just-in-time 检索，不预加载所有数据 |

#### 6.4 Just-In-Time 检索策略

**核心理念**：不预加载所有数据，维护轻量标识符（文件路径、查询、链接），运行时动态加载。

**混合策略最有效**：部分数据预加载求速度 + 自主探索求灵活。

Claude Code 的做法：写查询、存储结果、使用 head/tail 分析大数据。

#### 6.5 长期任务的 Context 管理

**Compaction（压缩）**：
- 对话逼近 context window 极限时，将内容压缩为摘要并重启新窗口
- Claude Code 保留架构决策、未解决 bug、实现细节，丢弃冗余工具输出
- **清除工具调用和结果是最安全的低成本压缩形式**

**Structured Note-Taking（结构化笔记）**：
- Agent 定期将笔记写入 context window 之外的持久存储
- Claude Code 创建 to-do 列表；自定义 agent 维护 NOTES.md

**Sub-Agent 架构**：
- 专门的 sub-agent 在干净的 context window 中处理聚焦任务
- 每个 subagent 可能消耗数万 token 做深度探索
- 只返回 **1000-2000 token 的精炼摘要**
- 实现关注点分离

#### 6.6 OpenAI 的 Context 管理策略

**两种核心技术**：

| 技术 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Context Trimming** | 确定性、零延迟 | 突然"失忆" | 独立任务 |
| **Context Summarization** | 保留长期记忆 | 摘要损失和偏差 | 上下文依赖任务 |

**Context Reset vs Compaction**（Anthropic 发现）：

> **Context reset（完全清除并用结构化交接重启）比 compaction 更有效**——至少对 Sonnet 4.5 而言。模型在感知到 context window 极限时会过早结束工作（"context 焦虑"）。

---

### 7. 状态管理与记忆

#### 7.1 LangGraph 的 Checkpointing 系统

LangGraph 的 checkpointing 是最成熟的状态管理方案：

- 支持 PostgreSQL、MongoDB 或自定义 `BaseCheckpointSaver`
- Thread History：获取 thread 的所有历史状态
- Thread State At Checkpoint：获取特定 checkpoint 的状态
- Copy Thread：复制 state 和 checkpoints 到新 thread
- Prune Threads：`delete`（完全删除）和 `keep_latest`（清理旧 checkpoint 保留最新状态）

#### 7.2 OpenAI 的 Memory 生命周期

```
1. Memory Distillation — 对话中通过工具实时捕获候选记忆
2. Memory Consolidation — session 后异步合并到 global memory
3. Memory Injection — 运行开始时通过 hooks 注入到 agent 指令
```

**优先级规则**：
1. 当前对话中用户最新消息（最高）
2. Session memory 覆盖 global memory
3. 同一列表中，最近日期优先
4. Global memory 作为建议性默认

#### 7.3 LangGraph 的 Store API

内置持久化存储，支持：
- 按命名空间搜索/列表
- 自然语言搜索
- 自定义 `BaseStore` 实现
- Key-Value 存储和检索

#### 7.4 Anthropic 的 Contextual Retrieval

在 RAG 系统中，传统 chunk 失去上下文。解决方案：

```
原始: "The company's revenue grew by 3% over the previous quarter."
上下文化: "This chunk is from an SEC filing on ACME corp's performance
in Q2 2023; the previous quarter's revenue was $314 million.
The company's revenue grew by 3% over the previous quarter."
```

性能数据：
- Contextual Embeddings 单独：检索失败率降低 35%
- \+ Contextual BM25：降低 49%
- \+ Reranking：降低 **67%**

---

### 8. 流式输出与异步处理

#### 8.1 流式输出设计

**LangGraph 的 Streaming 端点**：
- Create Run + Stream Output（有状态/无状态）
- Join Run Stream：加入已有 run 的流式输出
- Join Thread Stream：流式输出 thread 上所有顺序执行的 run 输出
- **Stream Resumable**：设置 `stream_resumable=true`，可从上次事件 ID 恢复流

**LLMCompiler 的流式优化**：
- Planner 输出流式处理
- Output parser 急切地 yield 任务参数
- Task Fetching Unit 直接消费任务流，依赖满足即调度

#### 8.2 长期运行 Agent 的 Harness 设计

**来源**: Anthropic *Effective Harnesses for Long-Running Agents*

核心问题：Agent 在离散会话中运行，每个新会话没有先前工作的记忆——"轮班制的工程师"。

两种失败模式：
1. **过度野心**：试图在单个 context 中完成整个应用，token 耗尽时功能未完成
2. **虚假完成**：后续 agent 实例看到已有进展后过早宣布完成

**解决方案**：

| 组件 | 职责 |
|------|------|
| **Initializer Agent** | 建立基础设施、init.sh、进度追踪文件、初始 git commit |
| **Coding Agent** | 每次只做一个功能的增量进展、保持 production-ready |
| **Feature List** | 用 **JSON 格式**而非 Markdown——"模型不太可能不恰当地修改 JSON 文件" |
| **Session Checklist** | pwd → git log → 进度文件 → 选最高优先级功能 |

#### 8.3 Durable Execution

**Background Runs**：创建 run 并立即返回 run ID，不等待最终输出。

**Double Texting**：处理用户在 agent 运行中发新消息：
- `enqueue` 策略：排队等待当前 run 完成

---

### 9. 安全与 Guardrails

#### 9.1 Anthropic 的 Auto Mode 两层防御

**威胁模型**：
1. 过度积极行为（超出授权范围）
2. 诚实错误（误解资源范围）
3. Prompt injection（文件/工具输出中的恶意指令）
4. 模型错位（追求自身目标）

**Input 层**：服务端 prompt-injection 探针扫描工具输出

**Output 层**：Transcript classifier（Sonnet 4.6）两阶段评估：
- Stage 1：快速单 token yes/no 过滤（倾向阻止）
- Stage 2：Chain-of-thought 推理（仅对标记的动作运行）

**三级权限**：
| 层级 | 范围 | Classifier |
|------|------|------------|
| Tier 1 | 文件读取、搜索 | 无需 |
| Tier 2 | 项目内文件写入/编辑 | 跳过（VCS 可审查） |
| Tier 3 | Shell、Web、外部集成 | 必须通过 |

**Reasoning Blindness**：Classifier 只看用户消息和工具调用，看不到 assistant 解释或工具输出。防止 agent "说服" classifier 允许危险操作。

#### 9.2 OpenAI 的三层 Guardrail 架构

| 层级 | 范围 | 用途 |
|------|------|------|
| **Pre-flight** | PII 检测、凭证扫描 | 数据保护 |
| **Input Guardrails** | Jailbreak、prompt injection、off-topic | 防止恶意输入 |
| **Output Guardrails** | 脱敏、hallucination 检查、schema 验证 | 确保输出安全 |

**G-Eval 方法**（Output Guardrails）：
1. Domain → 2. Criteria → 3. Steps → 4. Score (1-5)

**Hallucination Guardrails** 四维度：
- Knowledge Accuracy, Relevance, Policy Compliance, Contextual Coherence
- 实现精度：Precision 0.97, Recall 1.00

#### 9.3 治理 Agentic AI 的七项原则（OpenAI 论文）

1. 设置 agent 的**默认行为**以增加安全性
2. **Legibility**：agent 活动的可见性
3. **自动监控** AI agent
4. **可归因性**和健壮的身份验证
5. **可中断性**和维持控制
6. 人类监督机制和审批门
7. 审计 agent 决策和行为

#### 9.4 沙箱隔离（Anthropic）

- 文件系统隔离：OS 级原语（Linux bubblewrap, macOS seatbelt）
- 网络隔离：通过 unix domain socket + 域名限制
- 即使 prompt injection 成功也完全隔离——被攻破的 Claude Code 无法窃取 SSH key

---

### 10. Agent 评估体系

#### 10.1 Anthropic 的评估框架

**核心术语**：
| 术语 | 定义 |
|------|------|
| Task | 带定义输入和成功标准的单个测试 |
| Trial | 每次尝试（多次考虑输出方差） |
| Grader | 评分逻辑 |
| Transcript | 完整记录（输出、工具调用、推理） |
| Outcome | 最终环境状态 |

**三种 Grader**：
- **基于代码**：快速可复现（字符串匹配、二元测试），但对有效变体脆弱
- **基于模型**：灵活但引入非确定性
- **人工评审**：金标准但昂贵

**非确定性指标**：
- **pass@k**：k 次尝试中至少一次成功的概率
- **pass^k**：k 次尝试全部成功的概率

#### 10.2 不同 Agent 类型的评估策略

| Agent 类型 | 评估方法 |
|-----------|----------|
| **Coding Agent** | 确定性测试 + LLM rubric 评代码质量 + 静态分析 |
| **Conversational Agent** | 结果 + transcript 约束 + 交互质量（用 LLM 模拟用户） |
| **Research Agent** | groundedness + 覆盖率 + 来源质量 |
| **Computer Use Agent** | 真实/沙箱环境 + DOM vs Screenshot 交互 |

#### 10.3 基础设施噪声

**关键发现**（Anthropic）：基础设施配置差异可产生 **6 个百分点** 的成绩差异（p < 0.01），有时超过顶级模型间的性能差距。

建议：排行榜差异低于 3 个百分点时应持怀疑态度。

#### 10.4 OpenAI 的在线/离线评估

**在线评估**：Cost Tracking、Latency Monitoring、Custom Attributes、User Feedback、LLM-as-a-Judge

**离线评估**：基准 dataset → agent 运行 → 配置对比 → LLM-as-a-Judge 评分

**Eval-Driven System Design**：使用 evaluation flywheel 构建稳健的 prompt，检测 regression。

---

## 第二部分：Loomic 现有架构深度分析

### 架构总览

Loomic 的 Agent 系统基于 **deepagents 框架**（而非原始 LangGraph），围绕 canvas 操作构建：

```
Frontend (WebSocket)
  ↓
WsHandler → AgentRunService.createRun() → runId
  ↓
AgentRunService.streamRun(runId)
  ├── 加载 persistence（checkpointer + store）
  ├── 解析 brand kit
  ├── 构建 submitImageJob / persistImage 闭包
  └── 创建 agent 实例
       └── agent.streamEvents()
            ├── 主 Agent 编排循环
            ├── Tools（inspect, manipulate, screenshot, search, brand kit）
            └── Sub-agents（image_generate, video_generate）
  ↓
adaptDeepAgentStream() → StreamEvent → WS → Frontend
```

### 关键设计决策

| 决策 | 说明 | 对标行业实践 |
|------|------|-------------|
| **deepagents 框架** | 结构化输出的 sub-agent，schema-driven | 对应 OpenAI Structured Output + Anthropic 的 Orchestrator-Worker |
| **Sub-agent 模式** | image_generate / video_generate 独立 prompt+tools | 对应 LangChain Supervisor + OpenAI Agents as Tools |
| **闭包注入** | submitImageJob / persistImage 通过闭包而非工具参数传递敏感数据 | 对应 OpenAI "减轻模型负担" |
| **PGMQ 任务队列** | PostgreSQL 原生消息队列处理异步图片生成 | 对应 LangGraph Background Runs |
| **Per-canvas Backend Namespace** | 每个 canvas 隔离的 workspace/memories | 对应 LangGraph Store 命名空间隔离 |
| **Stream Adapter** | LangChain Event → 自定义 StreamEvent + artifact 提取 | 对应 LangGraph Stream 端点 |
| **Sub-agent Artifact 抑制** | 内部工具 artifact 被抑制，由父级重新发射 | 独特设计，避免前端 artifact 重复 |

### System Prompt 分析

位于 `apps/server/src/agent/prompts/loomic-main.ts`（约 107 行，中文）：

**优点**：
- 角色定义清晰（可爱活泼的 AI 设计助手）
- 工具使用策略分层（单张/多张/画布操作）
- 坐标系统详细说明
- 操作参考表完整（10 种 manipulate_canvas 操作）
- 设计调色板快速参考（9 个浅色填充 + 5 个强调色）
- 行为边界明确

**待改进**：
- 与行业最佳实践对比，缺少显式的 Reasoning Steps 段落
- 没有 Few-Shot Examples（行业建议"示例胜过千言万语"）
- 缺少 Think Tool 集成（可在复杂画布操作前反思）
- 没有明确的错误处理指导（工具调用失败时怎么做）

### 工具设计分析

| 工具 | 当前状态 | 对标最佳实践 |
|------|---------|-------------|
| **inspect_canvas** | 支持 detail_level, filter_type, filter_region | 良好——对应 Anthropic "Token 效率优化" |
| **manipulate_canvas** | 1400+ 行，10 种操作的 discriminated union | 功能强大但文件过大 |
| **generate_image** | 同步/异步双模式，provider registry | 良好——对应 OpenAI "合并操作" |
| **screenshot_canvas** | WebSocket RPC，multimodal 输出 | 对应 Anthropic "视觉验证" |
| **project_search** | regex + glob 模式 | 基础功能 |
| **get_brand_kit** | 条件注册 | 良好——按需加载 |

### 多 Agent 协作分析

当前采用 **Supervisor + Sub-agent** 模式：
- 主 Agent 根据任务类型委派给 image_generate 或 video_generate sub-agent
- Sub-agent 有独立的 prompt、tools 和 responseSchema
- 通过 Stream Adapter 的抑制逻辑避免 artifact 重复

这对应了 LangChain 的 Supervisor 模式和 OpenAI 的 Agents as Tools 模式。

### 状态管理分析

- **Checkpointing**：可选的 LangGraph checkpointer（基于 threadId）
- **Store**：命名空间隔离的持久化存储
- **Backend 隔离**：CompositeBackend 实现多租户安全

---

## 第三部分：Gap 分析与改进建议

### Gap 1：Think Tool 缺失

**现状**：Agent 在执行复杂画布操作时没有"思考暂停"机制。

**行业实践**：Anthropic 的 Think Tool 在策略密集型场景中提供 **54% 相对提升**。

**建议**：为 Loomic Agent 添加 think 工具，特别是在以下场景触发：
- 处理 inspect_canvas 返回的大量元素数据后
- 执行多步画布操作前的规划阶段
- screenshot 验证后的分析阶段

**预期收益**：减少不必要的 manipulate_canvas 调用，提高一次性操作成功率。

**实现复杂度**：低——只需添加一个无副作用的工具定义。

### Gap 2：Few-Shot Examples 缺失

**现状**：System prompt 有详细的操作参考表，但没有端到端的使用示例。

**行业实践**：
- Anthropic："对 LLM 来说，示例胜过千言万语"
- OpenAI："复杂工具在 system prompt 中增加 `# Examples` section"
- Anthropic 工具使用示例：准确率从 72% 提升到 **90%**

**建议**：在 system prompt 中添加 2-3 个典型交互示例：
1. 用户要求"画一个流程图" → inspect → 规划 → 批量 manipulate（add_shape + add_line）
2. 用户要求"生成一张产品图并放在画布中央" → image_generate sub-agent → placement
3. 用户要求"调整这些元素的对齐" → inspect → screenshot → manipulate(align)

**预期收益**：显著提高复杂多步骤操作的一次性成功率。

**实现复杂度**：低——在 prompt 中增加示例段落。

### Gap 3：错误处理指导不足

**现状**：System prompt 没有明确指导工具调用失败时的行为。

**行业实践**：
- Anthropic："错误响应提供可操作指引"
- OpenAI："Validate arguments before sending; if unsure, ask for clarification"
- OpenAI Agentic Prompt："如果不确定，使用工具查看，不要猜测"

**建议**：在 system prompt 中增加错误处理段落：
```
## 错误处理
- 如果 inspect_canvas 返回空结果，先确认 canvas_id 是否正确
- 如果 manipulate_canvas 操作失败，用 screenshot_canvas 验证当前状态
- 如果 generate_image 超时，告知用户正在异步处理，稍后可查看
- 不要猜测画布内容——始终先 inspect 或 screenshot
```

**实现复杂度**：低。

### Gap 4：Context 压缩策略缺失

**现状**：使用 LangGraph checkpointer 持久化对话，但没有显式的 context 压缩策略。

**行业实践**：
- Anthropic：清除工具调用和结果是最安全的低成本压缩形式
- OpenAI：Context Trimming + Summarization 混合
- Anthropic：Context reset 比 compaction 更有效

**建议**：
1. 实现 context trimming：当对话超过阈值时，保留最近 N 轮 + 画布状态摘要
2. 工具结果压缩：inspect_canvas 的详细输出在下一轮后压缩为摘要
3. 考虑 session 重置策略：长对话中定期重置，用结构化交接保留关键上下文

**实现复杂度**：中。

### Gap 5：工具描述缺少使用示例

**现状**：工具定义使用 JSON Schema，但没有 `examples` 字段。

**行业实践**：
- Anthropic："JSON schema 只定义结构有效性，无法传达使用模式"
- OpenAI Tool Use Examples：准确率提升 18 个百分点

**建议**：在工具 description 中添加典型调用示例：
```typescript
description: `Manipulate canvas elements.
Example: To add a labeled rectangle:
{
  "operations": [{
    "action": "add_shape",
    "type": "rectangle",
    "x": 100, "y": 100, "width": 200, "height": 100,
    "label": {"text": "Step 1", "fontSize": 16}
  }]
}`
```

**实现复杂度**：低。

### Gap 6：manipulate_canvas 文件过大

**现状**：1400+ 行的单一文件处理 10 种操作。

**行业实践**：
- Anthropic："更小、界限明确的单元更容易推理，编辑更可靠"
- 所有三家公司都强调单一职责

**建议**：将 manipulate_canvas 按操作类型拆分：
```
tools/
  manipulate-canvas/
    index.ts          // 入口 + schema 定义
    operations/
      shape.ts        // add_shape, add_text, add_line
      transform.ts    // move, resize, reorder
      style.ts        // update_style
      layout.ts       // align, distribute
      delete.ts       // delete
    helpers/
      geometry.ts     // computeEdgePoint, CJK 文本宽度
      binding.ts      // 箭头绑定逻辑
```

**预期收益**：更好的可维护性，减少 bug 引入风险。

**实现复杂度**：中。

### Gap 7：Guardrails 体系缺失

**现状**：没有显式的安全 guardrails 层。Agent 对画布有完全的读写权限。

**行业实践**：
- Anthropic：三级权限 + Reasoning Blindness
- OpenAI：三层 Guardrails（Pre-flight / Input / Output）
- OpenAI：Hallucination Guardrails（四维度检查）

**建议**：分阶段实施：
1. **Phase 1（短期）**：Input validation — 检查用户 prompt 中的异常指令
2. **Phase 2（中期）**：Output guardrails — 验证 manipulate_canvas 操作的合理性（如防止删除所有元素）
3. **Phase 3（长期）**：完整的 classifier-based 权限分级

**实现复杂度**：高（但高价值）。

### Gap 8：Agent 评估体系缺失

**现状**：没有系统化的 agent 评估 pipeline。

**行业实践**：
- Anthropic：Task → Trial → Grader → Transcript → Outcome
- OpenAI：Eval-Driven System Design + evaluation flywheel
- LangChain：LangSmith 可观测性 + 评估框架

**建议**：
1. 创建 **canvas 操作 eval dataset**：典型的画布操作请求 + 期望结果
2. 实现 **基于代码的 grader**：验证 manipulate_canvas 操作后的画布状态
3. 添加 **LLM-as-judge grader**：评估 agent 响应的质量和相关性
4. 跟踪 **pass@k 和 pass^k 指标**
5. 集成 **LangSmith 或自定义 tracing** 做可观测性

**实现复杂度**：高（但长期核心价值）。

### Gap 9：Reflection / Self-Correction 缺失

**现状**：Agent 执行操作后没有自动验证环节。

**行业实践**：
- LangChain Reflection Agent：Generator → Reflector 循环
- Anthropic Evaluator-Optimizer：分离评估和生成
- Anthropic："分离评估和生成比让生成者自我批判更有效"

**建议**：
1. 在复杂画布操作后**自动触发 screenshot_canvas** 进行视觉验证
2. 实现轻量 reflection loop：操作 → screenshot → 验证 → [必要时修正]
3. 可选：引入独立的 evaluator sub-agent 评估操作质量

**实现复杂度**：中。

### Gap 10：工具搜索 / 按需加载

**现状**：所有工具在 agent 创建时全部注册（brand kit 除外）。

**行业实践**：
- Anthropic Tool Search：token 减少 85%，准确率提升 25 个百分点
- OpenAI：初始函数控制在 20 个以内，大量工具使用 tool_search

**建议**：当前 Loomic 工具数量较少（5-6 个），暂不紧迫。但随着功能扩展（如添加文本编辑、动画、导出等工具），应提前规划按需加载机制。

**实现复杂度**：低（当前）/ 中（未来）。

### 优先级矩阵

| 优先级 | Gap | 影响 | 复杂度 | ROI |
|--------|-----|------|--------|-----|
| P0 | Few-Shot Examples | 高 | 低 | 极高 |
| P0 | 错误处理指导 | 高 | 低 | 极高 |
| P0 | Think Tool | 中高 | 低 | 高 |
| P1 | 工具描述示例 | 中 | 低 | 高 |
| P1 | Reflection Loop | 高 | 中 | 高 |
| P1 | Context 压缩 | 中 | 中 | 中高 |
| P2 | manipulate_canvas 拆分 | 中 | 中 | 中 |
| P2 | Guardrails 体系 | 高 | 高 | 中 |
| P3 | Agent 评估体系 | 极高 | 高 | 高（长期） |
| P3 | 工具按需加载 | 低 | 低 | 低（当前） |

---

## 附录：关键文章索引

### Anthropic Engineering

| 日期 | 文章 | 核心主题 |
|------|------|----------|
| 2026-03 | Claude Code Auto Mode | Agent 安全、权限分类器 |
| 2026-03 | Harness Design for Long-Running Apps | Generator-Evaluator 循环 |
| 2026-03 | Quantifying Infrastructure Noise | Eval 基础设施噪声 |
| 2026-02 | Building a C Compiler | 16 并行 Agent 协作 |
| 2026-01 | Demystifying Evals for AI Agents | Agent 评估方法论 |
| 2025-11 | Effective Harnesses for Long-Running Agents | Initializer/Coding Agent 模式 |
| 2025-11 | Advanced Tool Use | Tool Search、Programmatic Calling |
| 2025-11 | Code Execution with MCP | 代码执行式工具调用 |
| 2025-10 | Claude Code Sandboxing | 文件系统/网络隔离 |
| 2025-09 | Effective Context Engineering | Context 策展和管理 |
| 2025-09 | Writing Tools for Agents | 工具设计五原则 |
| 2025-06 | Multi-Agent Research System | Orchestrator-Worker 实战 |
| 2025-03 | The Think Tool | 复杂工具使用中的思考暂停 |
| 2024-12 | Building Effective Agents | **Agent 设计总纲** |
| 2024-09 | Contextual Retrieval | RAG 系统增强 |

### LangChain Blog

| 文章 | 核心主题 |
|------|----------|
| What is an Agent | Agent 定义与 Agentic 频谱 |
| LangGraph Multi-Agent Workflows | Collaboration / Supervisor / Hierarchical 三种拓扑 |
| Reflection Agents | Basic Reflection / Reflexion / LATS 三层反思 |
| Planning Agents | Plan-and-Execute / ReWOO / LLMCompiler |
| Building Multi-Agent Applications with Deep Agents | 深度 agent 多 agent 应用 |
| Evaluating Deep Agents | Agent 评估经验 |
| Agent Frameworks, Runtimes, and Harnesses | 框架/运行时/Harness 三者区分 |
| On Agent Frameworks and Agent Observability | Agent 可观测性 |

### OpenAI

| 来源 | 核心主题 |
|------|----------|
| A Practical Guide to Building Agents (PDF) | Agent 构建实用指南 |
| Harness Engineering Blog | 环境工程、Depth-First、AGENTS.md |
| Function Calling Guide | Tool Calling 五步循环、Strict Mode |
| Prompt Engineering Guide | 消息角色层级、推荐结构 |
| GPT-4.1 Prompting Guide | Agentic 三大关键提醒 |
| Orchestrating Agents Cookbook | Routines and Handoffs |
| Context Engineering: Personalization | Memory 生命周期、State 架构 |
| Session Memory Management | Context Trimming vs Summarization |
| Developing Hallucination Guardrails | 四维度检查、G-Eval |
| Building Governed AI Agents | Policy-as-Code、Zero Data Retention |
| Practices for Governing Agentic AI | 治理七项原则 |

---

> **核心结论**：Loomic 的 Agent 架构在核心编排模式（Supervisor + Sub-agent）、工具设计（canvas 操作）和异步处理（PGMQ）方面已经建立了良好的基础。最大的提升空间在于**提示词工程的精细化**（Few-Shot Examples、Think Tool、错误处理指导）和**自动验证环节**（Reflection Loop）——这些都是低成本高回报的改进。中长期应关注 Guardrails 体系和系统化评估 pipeline 的建设。
