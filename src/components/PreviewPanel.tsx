import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCw,
  Maximize2,
  Minimize2,
  Monitor,
  Smartphone,
  AlertTriangle,
  Wrench,
  Code2,
  Eye,
} from 'lucide-react';
import { injectPreviewBridge } from '../lib/bridgeInjector';
import { validateSimulationHtml } from '../lib/htmlValidator';
import type { RuntimeDiagnostic } from '../types/simulation';
import { CodeEditor } from './CodeEditor';

interface PreviewPanelProps {
  html: string;
  theme: 'light' | 'dark';
  preferredVoice?: string;
  diagnostics: RuntimeDiagnostic[];
  onAddDiagnostic: (diag: RuntimeDiagnostic) => void;
  onClearDiagnostics: () => void;
  onAskAiToFix: (errorSummary: string) => void;
  onApplyManualCode: (newHtml: string) => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  html,
  theme,
  preferredVoice,
  diagnostics,
  onAddDiagnostic,
  onClearDiagnostics,
  onAskAiToFix,
  onApplyManualCode,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [simStatus, setSimStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const validation = useMemo(() => validateSimulationHtml(html), [html]);
  const bridgedSrcDoc = useMemo(() => injectPreviewBridge(html), [html]);
  const contentHash = useMemo(() => {
    let hash = 5381;
    for (let i = 0; i < bridgedSrcDoc.length; i++) {
      hash = ((hash << 5) + hash + bridgedSrcDoc.charCodeAt(i)) >>> 0;
    }
    return `${bridgedSrcDoc.length}-${hash.toString(36)}`;
  }, [bridgedSrcDoc]);

  useEffect(() => {
    setSimStatus(validation.valid ? 'loading' : 'error');
  }, [html, reloadNonce, validation.valid]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        payload?: {
          message?: string;
          source?: string;
          line?: number;
          column?: number;
          canvasCount?: number;
        };
      };
      if (!data || data.source !== 'physica-preview') return;

      if (data.type === 'sim_ready') {
        setSimStatus((prev) => (prev === 'error' ? 'error' : 'ready'));
        try {
          iframeRef.current?.contentWindow?.postMessage(
            {
              source: 'physica-studio',
              type: 'set_walkthrough_voice',
              voiceURI: preferredVoice || '',
            },
            '*'
          );
        } catch {
          // Ignore cross-frame postMessage errors
        }
      } else if (data.type === 'runtime_error' || data.type === 'console_error') {
        setSimStatus('error');
        onAddDiagnostic({
          id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: 'error',
          message: data.payload?.message || 'Runtime execution error inside simulation.',
          source: data.payload?.source,
          line: data.payload?.line,
          column: data.payload?.column,
          timestamp: Date.now(),
        });
      } else if (data.type === 'console_warn') {
        onAddDiagnostic({
          id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: 'warn',
          message: data.payload?.message || 'Console warning.',
          timestamp: Date.now(),
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAddDiagnostic, preferredVoice]);

  useEffect(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: 'physica-studio',
          type: 'set_walkthrough_voice',
          voiceURI: preferredVoice || '',
        },
        '*'
      );
    } catch {
      // Ignore cross-frame postMessage errors
    }
  }, [preferredVoice]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleReload = () => {
    onClearDiagnostics();
    setSimStatus('loading');
    setReloadNonce((n) => n + 1);
  };

  const toggleFullscreen = async () => {
    if (!stageWrapperRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await stageWrapperRef.current.requestFullscreen().catch(() => {});
    }
  };

  const errorDiagnostics = diagnostics.filter((d) => d.level === 'error');
  const hasErrors = !validation.valid || errorDiagnostics.length > 0;

  const combinedErrorSummary = [
    ...validation.errors,
    ...errorDiagnostics.map((d) => `${d.message}${d.line ? ` (line ${d.line})` : ''}`),
  ].join('\n');

  return (
    <section
      ref={stageWrapperRef}
      aria-label="Simulation Preview Workspace"
      className="flex-1 min-w-0 flex flex-col bg-slate-100 dark:bg-slate-950 h-full"
    >
      {/* Preview Toolbar */}
      <div className="h-11 shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Segmented View Switcher */}
          <div
            role="tablist"
            aria-label="Preview mode"
            className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'preview'}
              onClick={() => setActiveTab('preview')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'code'}
              onClick={() => setActiveTab('code')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'code'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Source Code</span>
            </button>
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:inline">
            {hasErrors
              ? 'Error detected'
              : simStatus === 'ready'
                ? 'Simulation running'
                : 'Initializing WebGL'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab === 'preview' && (
            <div className="hidden sm:inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 mr-1">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                title="Desktop viewport"
                aria-label="Desktop viewport"
                className={`p-1 rounded transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                title="Mobile viewport (390 × 760)"
                aria-label="Mobile viewport"
                className={`p-1 rounded transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleReload}
            title="Reload simulation iframe"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reload</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
            className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Diagnostic / Validation Error Bar */}
      {hasErrors && (
        <div
          role="alert"
          className="shrink-0 px-3 py-2 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900/70 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="min-w-0">
              <span className="font-medium">Simulation Runtime / Validation Issue: </span>
              <span className="font-mono text-[11px] break-all">
                {combinedErrorSummary.split('\n')[0]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onAskAiToFix(combinedErrorSummary)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3 h-3" />
              <span>Ask AI to Fix</span>
            </button>
            <button
              type="button"
              onClick={onClearDiagnostics}
              className="px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:underline whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Stage (keeps iframe mounted across tab switches to preserve simulation state) */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          className={`absolute inset-0 flex items-center justify-center p-0 ${
            viewportMode === 'mobile' ? 'p-4 bg-slate-200/70 dark:bg-slate-950' : ''
          } ${activeTab === 'preview' ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'}`}
        >
          {validation.valid ? (
            <iframe
              key={`${contentHash}-${reloadNonce}`}
              ref={iframeRef}
              title="3D Physics Simulation Preview"
              srcDoc={bridgedSrcDoc}
              sandbox="allow-scripts allow-pointer-lock"
              className={`bg-slate-950 transition-all duration-150 ${
                viewportMode === 'mobile'
                  ? 'w-[390px] h-[min(760px,100%)] rounded-xl border border-slate-300 dark:border-slate-700 shadow-lg'
                  : 'w-full h-full border-0'
              }`}
            />
          ) : (
            <div className="max-w-md p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">
                Simulation HTML Cannot Be Rendered
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                {validation.errors.join(' ')}
              </p>
              <button
                type="button"
                onClick={() => onAskAiToFix(validation.errors.join('\n'))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Repair with AI Agent</span>
              </button>
            </div>
          )}
        </div>

        {activeTab === 'code' && (
          <div className="absolute inset-0 z-20">
            <CodeEditor
              value={html}
              theme={theme}
              onApplyCode={onApplyManualCode}
            />
          </div>
        )}
      </div>
    </section>
  );
};
