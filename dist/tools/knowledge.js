import { ok } from "../core/result.js";
import { GENRES } from "../knowledge/genres.js";
export function registerKnowledgeTools(server) {
    server.registerTool("list_genres", {
        title: "列出番茄赛道知识库",
        description: "列出番茄主流赛道的爽点机制、开篇要求、节奏、避坑清单与建议单章字数（不联网）。" +
            "写新书/定赛道前先看它；完整方法论也可读资源 fanqie://genres 与 fanqie://golden-three-chapters。",
    }, async () => ok({
        total: GENRES.length,
        genres: GENRES,
        usage: "把 key 作为赛道标识记录在本地小说登记里（本服务不强制校验赛道）。",
    }));
}
