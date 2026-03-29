# langchain框架使用指南

关于langchain，langgraph，deepagents相关开发查看官方llm.txt 作为索引 看对应网址文档 获取最佳实践，https://docs.langchain.com/llms.txt

对于其他框架包括nextjs,excalidraw等不理解或者不熟悉的地方 一定要 先去看文档或者源码再开始！ 确保先获取信息上下文再开干，不然容易导致返工。

# 真实网站登录态与可见浏览器操作规范

对于 Lovart 这类带登录态、Cloudflare/验证码、且需要用户肉眼可见操作的网站，不要误以为 `agent-browser --headed` 一定会弹出用户桌面可见窗口。它常常只是 agent 自己的浏览器会话，用户未必看得到，也不适合让用户手动登录。

遇到这类网站，优先使用用户桌面可见的真实 Chrome，并按下面顺序执行：

1. 先用 AppleScript 直接把目标网址打开到用户当前可见的 `Google Chrome`：
   `osascript` 控制 Chrome 新开 tab 或窗口，确保用户真的能看到页面。
2. 如果后续需要抓请求、监听画布变化、研究交互链路，不要继续依赖普通可见会话，改为启动带远程调试端口的独立 Chrome：
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile --new-window "<url>"`
3. 让用户在这个真实 Chrome 窗口里手动完成登录。
4. 登录完成后，再让 agent 通过 CDP 或 `agent-browser state save/load` 接管会话。
5. 如果历史记忆里提到某个 state 文件，例如 `/tmp/lovart-auth.json`，必须先检查文件是否真实存在；不存在就不要假设“第一种方式还能直接用”。

结论：凡是“需要用户看到窗口并手动登录”的任务，默认先用真实 Chrome；凡是“需要自动研究请求/DOM/画布变化”的任务，再切到带调试端口的真实 Chrome 会话，不要直接拿 `agent-browser --headed` 冒充用户可见浏览器。
