import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  SYSTEM_PROMPTS,
  buildMeetingSystemPrompt,
  buildUserMessage,
  resolveActionInstruction,
} from "@/lib/ai/prompts";
import type { AICompletionRequest, AICompletionErrorBody, AIActionKey, AIMode } from "@/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const FAST_MODEL_ID = "gpt-4o-mini";
const ADVANCED_MODEL_ID = "gpt-4o";

// Google retires Gemini model aliases frequently (the 1.5 family and
// gemini-2.0-flash are both gone from v1beta as of mid-2026). These are
// overridable via env vars so a future retirement doesn't require a code
// change — just update the env var to whatever ai.google.dev/api currently
// lists as valid for v1beta generateContent.
const GEMINI_FAST_MODEL_ID = process.env.GEMINI_FAST_MODEL_ID ?? "gemini-3.5-flash";
const GEMINI_ADVANCED_MODEL_ID = process.env.GEMINI_ADVANCED_MODEL_ID ?? "gemini-3.5-flash";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

function selectModel(mode: AIMode, action: AIActionKey) {
  const useAdvanced = mode === "generate" || action === "make_longer" || action === "summarize_meeting";

  if (process.env.AI_PROVIDER === "google") {
    return google(useAdvanced ? GEMINI_ADVANCED_MODEL_ID : GEMINI_FAST_MODEL_ID);
  }

  return openai(useAdvanced ? ADVANCED_MODEL_ID : FAST_MODEL_ID);
}

function jsonError(body: AICompletionErrorBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function stripEdgeNewlines(value: string): string {
  return value.replace(/^[\r\n\s]+/, "").replace(/[\r\n\s]+$/, "");
}

function describeProviderError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "El proveedor de IA devolvió un error sin detalle.";
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Ocurrió un error inesperado contactando al proveedor de IA.";
  }
}

export async function POST(req: Request): Promise<Response> {
  let payload: AICompletionRequest;

  try {
    payload = (await req.json()) as AICompletionRequest;
  } catch {
    return jsonError({ error: "invalid_json", detail: "Request body must be valid JSON." }, 400);
  }

  const { action, tone, language, meetingType, customContext, formatInstructions, styleInstructions } = payload;

  let mode: AIMode = payload.mode;
  const prompt = stripEdgeNewlines(payload.prompt ?? "");
  const context = payload.context !== undefined ? stripEdgeNewlines(payload.context) : payload.context;

  if (!mode || (mode !== "generate" && mode !== "transform")) {
    return jsonError({ error: "invalid_mode", detail: "mode must be 'generate' or 'transform'." }, 400);
  }

  if (mode === "transform" && (!context || context.length === 0)) {
    mode = "generate";
  }

  if (mode === "generate" && prompt.length === 0 && (!context || context.length === 0)) {
    return jsonError(
      {
        error: "missing_input",
        detail: "Provide either a non-empty 'prompt' or 'context' to generate content.",
      },
      400
    );
  }

  const resolvedAction: AIActionKey = action ?? (mode === "generate" ? "generate" : "custom");

  const instruction = resolveActionInstruction(resolvedAction, {
    tone,
    language,
    customPrompt: prompt,
  });

  const systemPrompt =
    resolvedAction === "summarize_meeting"
      ? buildMeetingSystemPrompt({ meetingType, customContext, formatInstructions, styleInstructions })
      : mode === "generate"
      ? SYSTEM_PROMPTS.GENERATION_AGENT
      : SYSTEM_PROMPTS.BASE_EDITOR_AGENT;

  const userMessage = buildUserMessage({
    action: resolvedAction,
    mode,
    instruction,
    context,
    prompt,
  });

  const provider = process.env.AI_PROVIDER === "google" ? "google" : "openai";

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return jsonError(
      {
        error: "missing_api_key",
        detail: "OPENAI_API_KEY is not configured on the server. Add it to your environment variables.",
      },
      500
    );
  }

  if (provider === "google" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return jsonError(
      {
        error: "missing_api_key",
        detail: "GOOGLE_GENERATIVE_AI_API_KEY is not configured on the server. Add it to your environment variables.",
      },
      500
    );
  }

  try {
    const model = selectModel(mode, resolvedAction);

    // Gemini 3 models are explicitly documented to work best at the default
    // temperature (1.0) — lowering it can degrade output quality/stability.
    // That guidance doesn't apply to OpenAI, so only override there.
    const temperature =
      provider === "google"
        ? undefined
        : resolvedAction === "fix_grammar"
        ? 0.2
        : resolvedAction === "summarize_meeting"
        ? 0.35
        : 0.7;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature,
      maxTokens: resolvedAction === "summarize_meeting" ? 4096 : 2048,
      onError: ({ error }) => {
        console.error("[ai/completion] stream error", describeProviderError(error));
      },
    });

    return result.toDataStreamResponse({
      getErrorMessage: describeProviderError,
      sendUsage: false,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return jsonError({ error: "ai_provider_error", detail: describeProviderError(err) }, 502);
  }
}
