import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  RotateCcw,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
} from 'lucide-react';
import type { ChatMessage, StudioSettings } from '../types/simulation';

interface ChatPanelProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  settings: StudioSettings;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onSendMessage: (prompt: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onRetryPrompt: (prompt: string) => void;
}

const SUGGESTED_PROMPTS = [
  'Visualize the electric field around two oppositely charged particles in 3D.',
  'Build an interactive double pendulum simulation with phase trails and energy readout.',
  'Show how changing mass affects acceleration of a block on an inclined plane with friction.',
  'Add air resistance (quadratic drag) and compare ideal vs. drag trajectories.',
  'Add a live kinetic vs. potential energy bar display to the current simulation.',
  'Make the simulation playback 0.5x slower and highlight the velocity components vx and vy.',
];

const RESPONSE_TYPE_LABEL: Record<string, string> = {
  new_simulation: 'New Simulation',
  code_modification: 'Code Modification',
  bug_fix: 'Bug Fix',
  explanation: 'Explanation',
  clarification: 'Clarification Needed',
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isGenerating,
  settings,
  width,
  onWidthChange,
  onClose,
  onSendMessage,
  onRestoreVersion,
  onRetryPrompt,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(messages.length <= 1);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const clamped = Math.min(560, Math.max(320, e.clientX - 224));
      onWidthChange(clamped);
    };
    const onMouseUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onWidthChange]);

  const submitPrompt = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    setInput('');
    setShowSuggestions(false);
    onSendMessage(trimmed);
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      aria-label="AI Simulation Agent"
      className="relative shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full max-w-full"
    >
      {/* Header */}
      <div className="h-11 shrink-0 px-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            Simulation Agent
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {settings.providerId === 'gemini' ? 'Gemini' : 'OpenAI-Compat'} · {settings.model}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse chat panel"
          title="Collapse chat panel"
          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-3">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const prevUserPrompt =
            msg.isError && idx > 0 && messages[idx - 1]?.role === 'user'
              ? messages[idx - 1].content
              : undefined;

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {isUser ? 'Teacher' : 'Agent'}
                </span>
                {msg.responseType && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{RESPONSE_TYPE_LABEL[msg.responseType] || msg.responseType}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div
                className={`w-full rounded-lg px-3 py-2.5 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white max-w-[92%]'
                    : msg.isError
                      ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-red-900 dark:text-red-200'
                      : 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                {msg.isError && (
                  <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-300 mb-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Generation Error</span>
                  </div>
                )}

                <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                {msg.clarificationQuestion && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium">
                    {msg.clarificationQuestion}
                  </div>
                )}

                {msg.educationalNotes && (
                  <p className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Pedagogy: </span>
                    {msg.educationalNotes}
                  </p>
                )}

                {msg.changedSections && msg.changedSections.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-medium">Updated: </span>
                    {msg.changedSections.join(' · ')}
                  </p>
                )}

                {msg.physicsAssumptions && msg.physicsAssumptions.length > 0 && (
                  <details className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none">
                      Physical assumptions ({msg.physicsAssumptions.length})
                    </summary>
                    <ul className="mt-1 pl-3.5 list-disc space-y-0.5">
                      {msg.physicsAssumptions.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {msg.versionId && !isUser && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onRestoreVersion(msg.versionId!)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore this snapshot</span>
                    </button>
                  </div>
                )}

                {msg.isError && prevUserPrompt && (
                  <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-900/60">
                    <button
                      type="button"
                      onClick={() => onRetryPrompt(prevUserPrompt)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300 hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry prompt</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-start gap-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                Updating physics simulation
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Synthesizing equations, Three.js scene, and AI documentation...
              </div>
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* Suggested Prompts */}
      <div className="px-3.5 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => setShowSuggestions((s) => !s)}
          className="flex items-center justify-between w-full text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
        >
          <span>Suggested Physics Prompts</span>
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${showSuggestions ? 'rotate-90' : ''}`}
          />
        </button>

        {showSuggestions && (
          <div className="mt-2 flex flex-col gap-1 max-h-36 overflow-y-auto">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  setInput(prompt);
                }}
                className="text-left text-[11px] px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-600 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Prompt Input */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-2 border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-slate-50 dark:bg-slate-950 focus-within:border-blue-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
              }
            }}
            rows={3}
            disabled={isGenerating}
            placeholder="Describe a physics simulation or ask for a modification..."
            aria-label="Simulation prompt"
            className="w-full resize-none bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Enter to send · Shift+Enter for newline
            </span>
            <button
              type="button"
              disabled={!input.trim() || isGenerating}
              onClick={submitPrompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3 h-3" />
              <span>{isGenerating ? 'Working...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Resize Handle (Desktop) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.cursor = 'col-resize';
        }}
        className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/40 transition-colors"
      />
    </aside>
  );
};
