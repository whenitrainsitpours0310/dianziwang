import { exploreInputSchema, zodIssues } from "@/lib/validation";
import { getPublicServiceStatus, readServerConfig } from "@/lib/server/config";
import {
  clientKey,
  errorResponse,
  jsonResponse,
  readJsonBody,
} from "@/lib/server/http";
import { RateLimiter } from "@/lib/server/rate-limit";
import { ServiceError } from "@/lib/server/errors";
import { exploreIdea } from "@/lib/server/explore";
import { searchTavily } from "@/lib/server/tavily";
import { requestAiAnalysis } from "@/lib/server/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const limiter = new RateLimiter(5, 60_000);

export async function POST(request: Request): Promise<Response> {
  try {
    if (!limiter.consume(clientKey(request))) {
      throw new ServiceError(
        "RATE_LIMITED",
        "探索请求过于频繁，请等待一分钟后再试。",
      );
    }

    const body = await readJsonBody(request);
    const parsed = exploreInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServiceError(
        "INVALID_INPUT",
        "灵感或检索范围不合法，请检查后重试。",
        { issues: zodIssues(parsed.error).slice(0, 8) },
      );
    }

    const config = readServerConfig();
    const status = getPublicServiceStatus(config);
    if (!status.search.configured || !status.ai.configured || !config.ai) {
      throw new ServiceError(
        "CONFIG_MISSING",
        "探索服务尚未配置完成：需要在服务端设置 TAVILY_API_KEY 与模型配置（AI_API_KEY、AI_MODEL，可选 AI_BASE_URL）。记录功能不受影响。",
        {
          searchMissing: status.search.missing,
          aiMissing: status.ai.missing,
        },
      );
    }

    const report = await exploreIdea(parsed.data, {
      model: config.ai.model,
      extractKeywords: (prompt) =>
        requestAiAnalysis({
          config: config.ai as NonNullable<typeof config.ai>,
          prompt,
          signal: request.signal,
          maxTokens: 400,
        }),
      search: ({ query, platform }) =>
        searchTavily({
          apiKey: config.tavilyApiKey as string,
          query,
          platform,
          signal: request.signal,
        }),
      analyze: (prompt) =>
        requestAiAnalysis({
          config: config.ai as NonNullable<typeof config.ai>,
          prompt,
          signal: request.signal,
        }),
    });

    return jsonResponse({ ok: true, report });
  } catch (error) {
    return errorResponse(error);
  }
}
