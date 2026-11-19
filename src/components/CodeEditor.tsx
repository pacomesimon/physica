import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Check, FileCode2, Info } from 'lucide-react';
import {
  EXPECTED_JS_SECTIONS,
  EXPECTED_WALKTHROUGH_SECTIONS,
  parseSimulationMetadata,
} from '../lib/metadataParser';

interface CodeEditorProps {
  value: string;
  theme: 'light' | 'dark';
  onApplyCode: (newHtml: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, theme, onApplyCode }) => {
  const editorMountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [draftValue, setDraftValue] = useState(value);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [showMetadataDrawer, setShowMetadataDrawer] = useState(true);

  const metadata = parseSimulationMetadata(draftValue);

  useEffect(() => {
    setDraftValue(value);
    setHasLocalEdits(false);
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== value) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        });
      }
    }
  }, [value]);

  useEffect(() => {
    if (!editorMountRef.current) return;

    const customTheme = EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: '12.5px',
          fontFamily: 'var(--font-mono)',
          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
        },
        '.cm-scroller': {
          overflow: 'auto',
          lineHeight: '1.55',
        },
        '.cm-gutters': {
          backgroundColor: theme === 'dark' ? '#0b1120' : '#f8fafc',
          color: theme === 'dark' ? '#64748b' : '#94a3b8',
          borderRight: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
        },
        '.cm-activeLine': {
          backgroundColor:
            theme === 'dark' ? 'rgba(51, 65, 85, 0.25)' : 'rgba(241, 245, 249, 0.8)',
        },
      },
      { dark: theme === 'dark' }
    );

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        html(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        customTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            setDraftValue(text);
            setHasLocalEdits(text !== value);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorMountRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create editor only when theme changes; doc updates are dispatched cleanly above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/80">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
          <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
          <span>Standalone HTML Source</span>
          <span aria-hidden="true">·</span>
          <span>{draftValue.split(/\r?\n/).length} lines</span>
          <span aria-hidden="true">·</span>
          <span>{metadata.presentSections.length}/10 AI sections</span>
          {metadata.hasWalkthrough && (
            <>
              <span aria-hidden="true">·</span>
              <span>Walkthrough ({metadata.walkthroughSegmentCount ?? 0} segs)</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMetadataDrawer((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showMetadataDrawer ? 'Hide AI Doc Outline' : 'AI Doc Outline'}</span>
          </button>

          {hasLocalEdits && (
            <button
              type="button"
              onClick={() => onApplyCode(draftValue)}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply & Save Version</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div ref={editorMountRef} className="flex-1 min-w-0 h-full overflow-hidden" />

        {showMetadataDrawer && (
          <aside className="w-64 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 overflow-y-auto p-3 flex flex-col gap-4 text-xs">
            <div>
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Simulation Metadata
              </h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {metadata.title} · {metadata.subject} · {metadata.difficulty}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Guided Walkthrough
              </h4>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-2 text-[11px] text-slate-600 dark:text-slate-300 flex flex-col gap-1 tabular-nums">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {metadata.hasWalkthrough
                    ? metadata.walkthroughTitle || 'Walkthrough Configured'
                    : 'Not configured'}
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>Segments</span>
                  <span>{metadata.walkthroughSegmentCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>simulationAPI</span>
                  <span>{metadata.hasSimulationApi ? 'Present' : 'Missing'}</span>
                </div>
              </div>
            </div>

            {metadata.governingEquations.length > 0 && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Governing Equations
                </h4>
                <ul className="flex flex-col gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {metadata.governingEquations.map((eq, idx) => (
                    <li
                      key={idx}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 break-words"
                    >
                      {eq}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Standard Code Sections
              </h4>
              <ul className="flex flex-col gap-1 text-[11px] tabular-nums">
                {EXPECTED_JS_SECTIONS.map((sec) => {
                  const found = metadata.presentSections.includes(sec.number);
                  return (
                    <li
                      key={sec.number}
                      className={`flex items-center justify-between px-2 py-1 rounded ${
                        found
                          ? 'text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      <span className="truncate">
                        {sec.number}. {sec.title}
                      </span>
                      <span className="shrink-0 ml-1">{found ? 'OK' : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Walkthrough & AI Sections ({metadata.walkthroughDocSections?.length ?? 0}/11)
              </h4>
              <ul className="flex flex-col gap-1 text-[10.5px] font-mono tabular-nums">
                {EXPECTED_WALKTHROUGH_SECTIONS.map((secName) => {
                  const found = Boolean(metadata.walkthroughDocSections?.includes(secName));
                  return (
                    <li
                      key={secName}
                      className={`flex items-center justify-between px-2 py-1 rounded ${
                        found
                          ? 'text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      <span className="truncate">{secName}</span>
                      <span className="shrink-0 ml-1">{found ? 'OK' : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
