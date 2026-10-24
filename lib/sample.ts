import { createIdea } from "@/lib/ideas";
import type { Idea } from "@/lib/types";

/**
 * 可选示例。只在用户主动点击时载入，并且每条都标记 isExample，
 * 不附带任何伪造的探索报告。
 */
export function createSampleIdeas(
  now: Date = new Date(),
  idFactory: () => string = () => crypto.randomUUID(),
): Idea[] {
  const samples: Array<{
    text: string;
    content: string;
    tags: string[];
    status: Idea["status"];
    motivation: Idea["motivation"];
  }> = [
    {
      text: "把我每天散落在便签里的灵感，整理成一个可以回看的个人创意库。",
      content:
        "想做一个不需要账户、打开就能记的小工具。重点是回看时能按状态和标签找到，而不是越记越乱。",
      tags: ["个人工具", "效率"],
      status: "exploring",
      motivation: "self",
    },
    {
      text: "做一个只记录今天想做的三件小事的极简桌面便签。",
      content: "不要项目管理和进度条，只保留今天、三件事、做完划掉。",
      tags: ["极简", "桌面"],
      status: "new",
      motivation: "fun",
    },
    {
      text: "把看到的好设计拆成可复用的配色和排版片段。",
      content:
        "收藏网页时自动截取配色、字体层级和留白节奏，积累成自己的设计参考库。",
      tags: ["设计", "灵感"],
      status: "paused",
      motivation: "learn",
    },
  ];

  return samples.map((sample, index) => {
    const createdAt = new Date(now.getTime() - index * 36 * 60 * 60 * 1000);
    const idea = createIdea(sample.text, createdAt, idFactory());
    return {
      ...idea,
      content: sample.content,
      tags: sample.tags,
      status: sample.status,
      motivation: sample.motivation,
      isExample: true,
      updatedAt: createdAt.toISOString(),
    };
  });
}
