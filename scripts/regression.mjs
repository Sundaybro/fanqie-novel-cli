import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fanqie-regression-'));
process.env.FANQIE_DATA_DIR = tmp;
process.env.FANQIE_ENABLE_BROWSER = '0';
delete process.env.FANQIE_CHROME_PATH;
const driver = await import('../dist/browser/driver.js');
const short = await import('../dist/services/short.js');
const text = await import('../dist/core/text.js');
let failures = 0;
async function check(name, run) {
    try {
        await run();
        console.log(`[PASS] ${name}`);
    }
    catch (error) {
        failures++;
        console.error(`[FAIL] ${name}: ${error.message}`);
    }
}
try {
    if (process.platform === 'darwin' && fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')) {
        await check('自动找到本机 macOS Chrome', () => assert.equal(driver.detectBrowser(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
    }
    await check('截图实际写入 screenshots 子目录', async () => {
        const file = await driver.shot({ screenshot: async ({ path: target }) => fs.writeFileSync(target, 'fixture') }, 'path-test');
        assert.equal(path.dirname(file), path.join(tmp, 'screenshots'));
        assert.equal(fs.readFileSync(file, 'utf8'), 'fixture');
    });
    await check('默认启动保留 Chrome 沙箱', () => {
        assert.equal(driver.LAUNCH_ARGS.includes('--no-sandbox'), false);
        assert.equal(driver.LAUNCH_ARGS.includes('--disable-setuid-sandbox'), false);
    });
    await check('CLI 不把纯数字 item_id 转成 Number', () => {
        const result = spawnSync(process.execPath, ['scripts/mcp-cli.mjs', 'delete_short_story_tomato', 'item_id=1234567890123456789'], {
            cwd: root, encoding: 'utf8', env: { ...process.env, MCP_ARGS: '' }, timeout: 15000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /1234567890123456789/);
        assert.equal(JSON.parse(result.stdout).action, 'preview');
    });
    await check('CLI 数字与布尔参数仍按 schema 解析', () => {
        const result = spawnSync(process.execPath, ['scripts/mcp-cli.mjs', 'list_short_stories_tomato', 'page_count=2'], {
            cwd: root, encoding: 'utf8', env: { ...process.env, MCP_ARGS: '' }, timeout: 15000,
        });
        assert.notEqual(result.status, 0);
        assert.match(JSON.parse(result.stdout).error, /前置条件/);
        const status = spawnSync(process.execPath, ['scripts/mcp-cli.mjs', 'get_publish_status', 'verify_login=false'], {
            cwd: root, encoding: 'utf8', env: { ...process.env, MCP_ARGS: '' }, timeout: 15000,
        });
        assert.equal(status.status, 0, status.stderr);
        assert.equal(typeof JSON.parse(status.stdout).ready, 'boolean');
    });
    await check('CLI 拒绝不精确 JSON 数字和拼错的参数', () => {
        for (const args of ['{"item_id":1234567890123456789}', '{"item_id":"1234567890123456789","confrim":true}']) {
            const result = spawnSync(process.execPath, ['scripts/mcp-cli.mjs', 'delete_short_story_tomato'], {
                cwd: root, encoding: 'utf8', env: { ...process.env, MCP_ARGS: args }, timeout: 15000,
            });
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /不精确|未知参数/);
        }
    });
    await check('新建预览不需要登录或浏览器，不创建空草稿', async () => {
        const r = await short.createShortStory({ title: '离线预览', content: '第一行\n第二行' });
        assert.equal(r.ok, true);
        assert.equal(r.action, 'preview-local');
        assert.equal(r.itemId, undefined);
    });
    await check('发布预览不需要登录或浏览器', async () => {
        const r = await short.publishShortStory({ itemId: '1234567890123456789' });
        assert.equal(r.ok, true);
        assert.equal(r.action, 'preview-local');
    });
    await check('短故事字数包含标点、英文和数字，避免错误拦截下限', () => {
        assert.equal(short.validateShortContent('中文ABC123，。\n ').wordCount, 10);
        const boundary = short.validateShortContent('文。'.repeat(3000));
        assert.equal(boundary.wordCount, 6000);
        assert.equal(boundary.warnings.length, 0);
    });
    await check('全文比对接受等价实体、换行与尾部空段', () => {
        assert.equal(typeof text.compareDraft, 'function');
        assert.deepEqual(text.compareDraft({ title: '标题', content: '<p>甲&amp;乙</p><p>次行</p><p></p><p>末段&#x3002;</p><p></p>' }, { title: '标题', content: '甲&乙\n次行\n\n末段。' }), []);
    });
    await check('短故事文本清洗保留多个连续空行', () => {
        assert.equal(text.toPlainText('甲\r\n\r\n\r\n乙', { preserveBlankLines: true }), '甲\n\n\n乙');
        assert.equal(text.toPlainText('甲\n\n\n乙'), '甲\n\n乙');
    });
    await check('全文比对拒绝标题、正文、换行不一致', () => {
        assert.equal(typeof text.compareDraft, 'function');
        assert.ok(text.compareDraft({ title: '旧标题', content: '<p>甲乙</p>' }, { title: '新标题', content: '甲\n乙' }).length >= 2);
        assert.ok(text.compareDraft({ title: '标题', content: '<p>截断</p>' }, { content: '截断的正文' }).length > 0);
    });
}
finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
if (failures)
    process.exitCode = 1;
