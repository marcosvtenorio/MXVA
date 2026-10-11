import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { API_ERRORS, type ApiErrorBody, type ApiErrorCode } from "@/lib/api-errors";
import { NO_STORE_HEADERS } from "./security/headers";

/** Thrown inside handlers; converted into the JSON error contract by `handle`. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? API_ERRORS[code].message);
  }
}

export function json<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

export function errorResponse(code: ApiErrorCode, message?: string, extraHeaders?: Record<string, string>): Response {
  const spec = API_ERRORS[code];
  const body: ApiErrorBody = { error: { code, message: message ?? spec.message, retryable: spec.retryable } };
  return json(body, { status: spec.status, headers: extraHeaders });
}

/**
 * Wraps a route handler: ApiErrors become contract responses; anything else becomes a
 * redacted 503 with only the error class logged (never request bodies or photo bytes).
 */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    // Framework control flow (e.g. "this route is dynamic" during prerendering) must pass through.
    unstable_rethrow(error);
    if (error instanceof ApiError) return errorResponse(error.code, error.message, error.headers);
    const name = error instanceof Error ? error.name : typeof error;
    console.error(`[api] unhandled ${name}`);
    return errorResponse("SERVICE_UNAVAILABLE");
  }
}

/** Reads a JSON body with a hard size cap, then validates it. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S, maxBytes = 16 * 1024): Promise<z.infer<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new ApiError("INVALID_REQUEST");
  const text = await readTextLimited(request, maxBytes);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_REQUEST");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST");
  return parsed.data;
}

export async function readTextLimited(request: Request, maxBytes: number): Promise<string> {
  const bytes = await readBytesLimited(request, maxBytes);
  return new TextDecoder().decode(bytes);
}

/** Streams the body and aborts as soon as it exceeds `maxBytes` (Content-Length is not trusted). */
export async function readBytesLimited(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("PHOTO_TOO_LARGE", "That request is too large.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError("PHOTO_TOO_LARGE", "That request is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
