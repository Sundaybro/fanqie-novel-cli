export interface Article {
    id: string;
    kind: "chapter" | "short";
    title: string;
    content: string;
    wordCount: number;
    novelId?: string;
    chapterNumber?: number;
    status: "draft" | "published" | "failed";
    tomatoBookId?: string;
    tomatoItemId?: string;
    publishTime?: string;
    lastMessage?: string;
    originalityScore?: number;
    createdAt: string;
    updatedAt: string;
}
export interface Novel {
    id: string;
    title: string;
    gender: number;
    author?: string;
    abstract?: string;
    protagonist1?: string;
    protagonist2?: string;
    tomatoBookId?: string;
    tomatoBookName?: string;
    readingTags?: string[];
    contentTags?: {
        plot?: string[];
        emotion?: string[];
        character?: string[];
        worldview?: string[];
    };
    genre?: string;
    synopsis?: string;
    outline?: string;
    worldSetting?: string;
    goldenHook?: string;
    characters?: {
        name: string;
        role?: string;
        traits?: string;
    }[];
    targetWordsPerChapter?: number;
    status?: string;
    createdAt: string;
    updatedAt: string;
}
export interface ShortStory {
    id: string;
    title: string;
    abstract?: string;
    category?: string;
    signType?: number;
    tomatoItemId?: string;
    status: "draft" | "published" | "failed";
    createdAt: string;
    updatedAt: string;
}
export interface PublishTask {
    id: string;
    kind: "novel" | "chapter" | "short";
    targetId?: string;
    title?: string;
    status: "pending" | "done" | "failed";
    mode: "upload" | "batch";
    message?: string;
    scheduledTime?: string;
    screenshotPath?: string;
    createdAt: string;
    updatedAt: string;
}
