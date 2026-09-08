import type { AIActionKey, AITone } from "@/types";

export const SYSTEM_PROMPTS = {
  BASE_EDITOR_AGENT: `You are an embedded AI text-processing engine operating inside a block-based document editor (similar to Notion AI).
Your core mission is to assist the user by generating, editing, or transforming content directly inside their document canvas.

CRITICAL OPERATIONAL RULES:
1. OUTPUT ONLY THE FINAL TEXT: Do NOT include intro/outro conversational fluff (e.g., "Sure, here is your text:", "Hope this helps!", "Here is the summary:").
2. NO MARKDOWN WRAPPER QUOTES: Do NOT enclose your entire output in backticks or quotes unless explicitly instructed to write a raw code block.
3. RESPECT CONTEXTUAL FORMATTING: Preserve headers, bullet points, numbered lists, and inline bold/italic styles present in the original input.
4. DIRECTNESS: Begin delivering the transformed or requested content immediately on the first character streamed.
5. CONCISE AND HIGH QUALITY: Output crisp, well-structured, professional prose free of typographical errors.`,

  GENERATION_AGENT: `You are an embedded AI writing engine generating new block content for a document editor from a slash command or natural-language instruction.
Follow the same operational rules as the base editor agent: no conversational fluff, no wrapper quotes, respect Markdown-style formatting (headers, bullets, numbered lists, bold/italic) so it can be parsed directly into editor blocks, and begin with the requested content immediately.`,

  MEETING_AGENT: `Eres un asistente de toma de notas de reuniones e investigación. Transforma la transcripción recibida en un documento estructurado en Markdown con encabezados H2 (##) para cada tema, viñetas directas y una sección final de "Tareas y Próxima Clase" usando casillas de verificación ( [ ] ). Conserva todos los términos técnicos y nombres.

REGLAS OPERATIVAS:
1. NO incluyas frases introductorias ni de cierre (ej. "Aquí tienes el resumen:", "Espero que te sea útil").
2. NO envuelvas la salida completa entre comillas ni backticks.
3. Usa encabezados H2 (##) por cada tema o bloque temático identificado en la transcripción, en el orden en que fueron tratados.
4. Dentro de cada tema, usa viñetas ("- ") directas y concisas; evita párrafos largos.
5. Cierra siempre con una sección "## Tareas y Próxima Clase" listando pendientes accionables como casillas de verificación, por ejemplo: "- [ ] Revisar el dataset antes del jueves".
6. Conserva nombres propios, siglas y términos técnicos exactamente como aparecen en la transcripción, incluso si contienen errores de reconocimiento de voz evidentes que puedas inferir y corregir sin alterar el significado.
7. La transcripción proviene de un reconocedor fonético y puede contener errores de nombres o jerga en inglés (ej. "guanacay" -> "WannaCry", "paiton" -> "Python"). Analiza el contexto técnico para corregir y normalizar de forma inteligente los términos antes de generar el resumen.
8. Si la transcripción está incompleta o contiene ruido, trabaja igualmente con lo disponible; nunca inventes decisiones o tareas que no se mencionaron.`,
} as const;

export const ACTION_INSTRUCTIONS: Record<
  Exclude<AIActionKey, "generate" | "custom" | "change_tone" | "translate" | "summarize_meeting">,
  string
> = {
  summarize: "Provide a clean, bulleted summary of the selected text capturing all key takeaways.",
  improve_writing: "Rewrite the selected text to enhance clarity, flow, vocabulary, and conciseness while preserving the exact original intent.",
  fix_grammar: "Correct all spelling, punctuation, and grammatical mistakes in the selected text. Make zero unnecessary stylistic changes.",
  make_longer: "Expand upon the key ideas in the selected text by adding relevant details, context, and elaboration.",
  make_shorter: "Condense the selected text to its essential core message, removing redundancy.",
};

export const MEETING_SUMMARY_INSTRUCTION =
  "Convierte la transcripción de la reunión en notas estructuradas en Markdown siguiendo exactamente el formato indicado en tus reglas operativas.";

export function buildMeetingSystemPrompt(params: {
  meetingType?: string;
  customContext?: string;
  formatInstructions?: string;
  styleInstructions?: string;
}): string {
  const { meetingType, customContext, formatInstructions, styleInstructions } = params;
  const extra: string[] = [];

  if (meetingType && meetingType.trim().length > 0) {
    extra.push(`TIPO DE REUNIÓN: ${meetingType.trim()}`);
  }
  if (customContext && customContext.trim().length > 0) {
    extra.push(`CONTEXTO ADICIONAL PROVISTO POR EL USUARIO: ${customContext.trim()}`);
  }
  if (formatInstructions && formatInstructions.trim().length > 0) {
    extra.push(`INSTRUCCIONES DE FORMATO DE SECCIONES PARA ESTE TIPO DE REUNIÓN: ${formatInstructions.trim()}`);
  }
  if (styleInstructions && styleInstructions.trim().length > 0) {
    extra.push(`INSTRUCCIONES DE ESTILO (viñetas vs párrafos): ${styleInstructions.trim()}`);
  }

  if (extra.length === 0) {
    return SYSTEM_PROMPTS.MEETING_AGENT;
  }

  return [
    SYSTEM_PROMPTS.MEETING_AGENT,
    "",
    "PERSONALIZACIÓN PARA ESTA REUNIÓN ESPECÍFICA (aplica esto por encima del formato genérico cuando haya conflicto):",
    ...extra,
  ].join("\n");
}

export function buildToneInstruction(tone: AITone): string {
  const labels: Record<AITone, string> = {
    professional: "Professional",
    casual: "Casual",
    academic: "Academic",
    confident: "Confident",
    friendly: "Friendly",
  };
  return `Rewrite the selected text using a ${labels[tone]} tone.`;
}

export function buildTranslateInstruction(language: string): string {
  return `Translate the selected text into ${language} accurately, preserving natural tone and idiomatic nuance.`;
}

export function resolveActionInstruction(
  action: AIActionKey,
  opts: { tone?: AITone; language?: string; customPrompt?: string }
): string {
  switch (action) {
    case "summarize":
    case "improve_writing":
    case "fix_grammar":
    case "make_longer":
    case "make_shorter":
      return ACTION_INSTRUCTIONS[action];
    case "change_tone":
      return buildToneInstruction(opts.tone ?? "professional");
    case "translate":
      return buildTranslateInstruction(opts.language ?? "English");
    case "summarize_meeting":
      return MEETING_SUMMARY_INSTRUCTION;
    case "generate":
    case "custom":
    default:
      return opts.customPrompt ?? "Generate content that fulfills the user's instruction.";
  }
}

export function buildUserMessage(params: {
  action: AIActionKey;
  mode: "generate" | "transform";
  instruction: string;
  context?: string;
  prompt: string;
}): string {
  const { mode, instruction, context, prompt, action } = params;

  if (action === "summarize_meeting") {
    return [`TASK: ${instruction}`, "", "MEETING TRANSCRIPT:", context || prompt || ""]
      .filter(Boolean)
      .join("\n");
  }

  if (mode === "transform") {
    return [
      `TASK: ${instruction}`,
      "",
      "SELECTED TEXT:",
      context ?? "",
      prompt ? `\nADDITIONAL USER INSTRUCTION: ${prompt}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    context ? `SURROUNDING DOCUMENT CONTEXT:\n${context}\n` : "",
    `USER INSTRUCTION: ${prompt || instruction}`,
  ]
    .filter(Boolean)
    .join("\n");
}
