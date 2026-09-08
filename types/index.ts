export type AIActionKey =
  | "summarize"
  | "improve_writing"
  | "fix_grammar"
  | "make_longer"
  | "make_shorter"
  | "change_tone"
  | "translate"
  | "generate"
  | "custom"
  | "summarize_meeting";

export type AIMode = "generate" | "transform";

export type AITone =
  | "professional"
  | "casual"
  | "academic"
  | "confident"
  | "friendly";

export interface AICompletionRequest {
  prompt: string;
  action?: AIActionKey;
  context?: string;
  mode: AIMode;
  tone?: AITone;
  language?: string;
  meetingType?: string;
  customContext?: string;
  formatInstructions?: string;
  styleInstructions?: string;
}

export interface AICompletionErrorBody {
  error: string;
  detail?: string;
}

export type AIOutputDecision = "accept_replace" | "insert_below" | "retry" | "discard";

export interface SelectionRange {
  from: number;
  to: number;
}

export interface AIStreamState {
  status: "idle" | "streaming" | "complete" | "error";
  action: AIActionKey | null;
  originText: string;
  streamedText: string;
  selection: SelectionRange | null;
  anchorRect: DOMRect | null;
  error: string | null;
}

export interface SlashCommandItem {
  key: AIActionKey | "heading1" | "heading2" | "heading3" | "bullet_list" | "ordered_list" | "task_list" | "code_block" | "quote" | "divider";
  label: string;
  description: string;
  group: "ai" | "basic";
  icon: string;
  keywords: string[];
}

export interface BubbleMenuAction {
  key: AIActionKey;
  label: string;
  icon: string;
  requiresInput?: boolean;
}

export interface DocumentMeta {
  id: string;
  title: string;
  updatedAt: string;
  wordCount: number;
}

export type BuiltInMeetingPresetId = "auto" | "interview" | "client_call" | "standup" | "security_class";

export interface MeetingPreset {
  id: string;
  label: string;
  meetingType: string;
  customContext?: string;
  formatInstructions?: string;
  styleInstructions?: string;
  builtIn: boolean;
}

export interface MeetingGenerationParams {
  transcript: string;
  meetingType: string;
  customContext?: string;
  formatInstructions?: string;
  styleInstructions?: string;
}

export interface WorkspaceDocument {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  icon?: string;
  isFolder?: boolean;
  createdAt: number;
  updatedAt: number;
}
