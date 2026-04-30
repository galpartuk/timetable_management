// Wire-format mirrors Anthropic's content block model so the FE can pass
// history straight through to the backend without translation.

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolProposal {
  id: string;
  name: string;
  input: Record<string, any>;
  preview: string;
}

export interface QuickAction {
  label: string;
  prompt: string;
}

export interface ModuleContext {
  module: string;
  viewState: Record<string, any>;
  quickActions?: QuickAction[];
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_running'; name: string; input: Record<string, any> }
  | { type: 'tool_result'; name: string; result: any }
  | { type: 'tool_proposal'; proposals: ToolProposal[]; assistant_content: ContentBlock[] }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: 'complete' | 'awaiting_confirmation' | 'error' };
