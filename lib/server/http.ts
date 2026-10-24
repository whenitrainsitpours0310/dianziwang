import { ServiceError } from "@/lib/server/errors";
import type { ApiErrorBody } from "@/lib/types";

export const MAX_REQUEST_BYTES = 64 * 1024;

export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown): Response {
  const publicError =
    error instanceof ServiceError
      ? {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        }
      : {
          code: "INTERNAL_ERROR" as const,
          message: "服务器内部错误，请稍后重试。",
        };
  const body: ApiErrorBody = { ok: false, error: publicError };
  return jsonResponse(
    body,
    error instanceof ServiceError ? error.status : 500,
  );
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ServiceError(
      "INVALID_INPUT",
      "请求必须使用 application/json。",
    );
  }

  const declared = request.headers.get("content-length");
  if (declared) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > MAX_REQUEST_BYTES) {
      throw new ServiceError(
        "PAYLOAD_TOO_LARGE",
        "请求体超过 64 KB 限制。",
      );
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ServiceError("INVALID_INPUT", "无法读取请求体。");
  }
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    throw new ServiceError("PAYLOAD_TOO_LARGE", "请求体超过 64 KB 限制。");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError("INVALID_INPUT", "请求体不是合法 JSON。");
  }
}
