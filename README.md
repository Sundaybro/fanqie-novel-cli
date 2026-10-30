# fanqie-novel-cli

番茄小说作家后台的本地命令行与 MCP 工具，支持短故事草稿管理、正文编辑和发布流程。

基于 [yangmi829/fanqie-autopub-mcp](https://github.com/yangmi829/fanqie-autopub-mcp) 修改，保留原作者署名和 [MIT 许可证](LICENSE)。

## 安装

需要 Node.js 20 或更新版本，以及本机 Chrome 或 Edge。

```bash
git clone https://github.com/Sundaybro/fanqie-novel-cli.git
cd fanqie-novel-cli
npm ci
npm test
```

请使用本仓库源码安装。内部 MCP 工具名称和 npm 包标识沿用上游，以保持兼容；本仓库的修改尚未发布到 npm。

## 使用

```bash
# 查看工具和资源
node scripts/mcp-cli.mjs --list
node scripts/mcp-cli.mjs --resources

# 打开浏览器，由本人完成登录
node scripts/mcp-cli.mjs login_tomato

# 检查登录状态和浏览器环境
node scripts/mcp-cli.mjs get_publish_status verify_login=true

# 查看短故事和草稿箱
node scripts/mcp-cli.mjs list_short_stories_tomato status=all page_count=10
node scripts/mcp-cli.mjs list_short_stories_tomato status=draft page_count=10

# 本地预览正文文件；story.txt 由使用者准备
node scripts/mcp-cli.mjs create_short_story_tomato title=故事标题 file_path=story.txt

# 明确保存草稿
node scripts/mcp-cli.mjs create_short_story_tomato title=故事标题 file_path=story.txt confirm=true
```

CLI 按工具 schema 解析参数，作品 ID 保持字符串，数字和布尔参数转换为对应类型。数组、对象和复杂参数可通过 `MCP_ARGS` JSON 传入；ID 在 JSON 中必须加引号。参数错误会报错并非零退出。

## 功能与边界

- 短故事列表、详情、新建草稿、修改草稿、封面设置与发布工具。
- 长篇作品与章节工具、本地文稿库、微头条工具。
- MCP 默认使用 stdio，可通过 `node dist/index.js` 启动，供支持 MCP 的客户端调用。
- 新建和发布短故事时，默认 `confirm=false` 只在本地预览，不创建线上空草稿。保存或发布需明确传入 `confirm=true`。
- 草稿保存后核对传入的标题和完整正文，包含单次换行、连续空行和正文内部空白。内容不一致或详情读取失败时返回失败。
- 分类、封面或 AI 选项尚未验证持久化时，会明确返回 `saved-unverified`，不能视为这些字段已经核验成功。
- 登录、验证码、实名、合同和协议事项由使用者本人处理；请根据实际创作情况选择内容声明。
- 正式发布、平台审核和签约是不同阶段，应在后台核查实际状态。本文不承诺所有平台流程已经验证。

## 本仓库修复

- macOS、Windows、常见 Linux 浏览器路径探测与跨平台截图路径。
- 默认保留 Chrome 沙箱保护。
- 长数字作品 ID 的精度与类型处理。
- 短故事换行、空行保存和草稿回读核验。
- 离线预览，避免预览产生空草稿。
- 依赖安全更新及回归检查。

## 本地数据

登录会话、文稿、截图和内部记录仅保存在本机忽略目录，不应上传到公开仓库。切勿在 issue、日志或提交中粘贴凭证。

## 验证

```bash
npm test
npm audit
```

`npm test` 运行构建、修复回归和 MCP 协议冒烟检查，使用临时数据，不访问真实作品。浏览器与线上流程需要另行验证。

测试中的 `TEST_FIXTURE_*` 名称和连续数字 ID 均为脚本内构造的虚构占位数据，不对应真实账号或作品。测试明确关闭浏览器能力，并使用独立临时目录。
