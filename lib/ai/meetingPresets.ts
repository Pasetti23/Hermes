import type { MeetingPreset } from "@/types";

const CUSTOM_PRESETS_KEY = "notion_meeting_custom_presets";

export const BUILT_IN_MEETING_PRESETS: MeetingPreset[] = [
  {
    id: "auto",
    label: "Auto",
    meetingType: "Reunión general",
    formatInstructions: "Agrupa el contenido en los temas que naturalmente surjan de la conversación.",
    styleInstructions: "Usa viñetas cortas y directas; evita párrafos largos.",
    builtIn: true,
  },
  {
    id: "interview",
    label: "Entrevistas",
    meetingType: "Entrevista",
    formatInstructions:
      "Organiza por bloques temáticos de la entrevista (trayectoria, motivaciones, preguntas técnicas, cierre). Incluye una sección '## Citas destacadas' con frases textuales relevantes del entrevistado.",
    styleInstructions: "Usa viñetas para datos concretos y un párrafo corto por bloque para dar contexto.",
    builtIn: true,
  },
  {
    id: "client_call",
    label: "Llamadas con clientes",
    meetingType: "Llamada con cliente",
    formatInstructions:
      "Incluye secciones '## Necesidades del cliente', '## Objeciones y dudas', '## Acuerdos comerciales' además de la sección final de tareas.",
    styleInstructions: "Viñetas breves orientadas a decisiones y compromisos, no a la narrativa de la charla.",
    builtIn: true,
  },
  {
    id: "standup",
    label: "Standup",
    meetingType: "Daily standup",
    formatInstructions:
      "Organiza por persona con sub-viñetas: qué hizo ayer, qué hará hoy, bloqueos. Mantén cada bloque muy breve.",
    styleInstructions: "Extremadamente conciso, viñetas de una línea, sin párrafos.",
    builtIn: true,
  },
  {
    id: "security_class",
    label: "Ciberseguridad / Clase Técnica",
    meetingType: "Clase técnica de ciberseguridad",
    formatInstructions:
      "Organiza por concepto técnico explicado (vulnerabilidades, herramientas, técnicas de ataque/defensa, nombres propios de malware o CVEs). Incluye una sección '## Glosario de términos' con los términos técnicos mencionados y su definición breve.",
    styleInstructions:
      "Viñetas técnicas precisas; conserva nombres de herramientas, lenguajes y CVEs exactamente como se normalizan.",
    builtIn: true,
  },
];

function readCustomPresets(): MeetingPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomPresets(presets: MeetingPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // localStorage unavailable — fail silently, custom presets just won't persist
  }
}

export function listMeetingPresets(): MeetingPreset[] {
  return [...BUILT_IN_MEETING_PRESETS, ...readCustomPresets()];
}

export function saveCustomMeetingPreset(preset: Omit<MeetingPreset, "id" | "builtIn">): MeetingPreset {
  const created: MeetingPreset = {
    ...preset,
    id: `custom_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    builtIn: false,
  };
  const existing = readCustomPresets();
  writeCustomPresets([...existing, created]);
  return created;
}

export function deleteCustomMeetingPreset(id: string): void {
  const existing = readCustomPresets();
  writeCustomPresets(existing.filter((p) => p.id !== id));
}
