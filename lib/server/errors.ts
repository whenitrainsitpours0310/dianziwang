export type ServiceErrorCode =
  | "INVALID_INPUT"
  | "CONFIG_MISSING"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SEARCH_FAILED"
  | "INSUFFICIENT_SOURCES"
  | "AI_FAILED"
  | "AI_INVALID_OUTPUT"
  | "INVALID_CITATIONS"
  | "INTERNAL_ERROR";

const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  INVALID_INPUT: 400,
  CONFIG_MISSING: 503,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SEARCH_FAILED: 502,
  INSUFFICIENT_SOURCES: 422,
  AI_FAILED: 502,
  AI_INVALID_OUTPUT: 422,
  INVALID_CITATIONS: 422,
  INTERNAL_ERROR: 500,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ServiceErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/** 不向客户端泄露堆栈、密钥或上游响应正文。 */
export function toPublicError(error: unknown): {
  code: ServiceErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isServiceError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "服务器内部错误，请稍后重试。",
  };
}
