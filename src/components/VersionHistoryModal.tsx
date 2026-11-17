import React, { useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { X, RotateCcw, GitCompare } from 'lucide-react';
import type { SimulationVersion } from '../types/simulation';

interface VersionHistoryModalProps {
  versions: SimulationVersion[];
  currentHtml: string;
  onRestore: (version: SimulationVersion) => void;
  onClose: () => void;
}

const SOURCE_LABELS: Record<SimulationVersion['source'], string> = {
  initial: 'Initial',
  ai: 'AI Modification',
  manual: 'Manual Edit',
  restore: 'Restored',
};

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  versions,
  currentHtml,
  onRestore,
  onClose,
}) => {
  const ordered = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions]
  );
  const [selectedId, setSelectedId] = useState<string>(ordered[0]?.id ?? '');
  const [compareMode, setCompareMode] = useState<'diff' | 'preview'>('diff');

  const selectedVersion = ordered.find((v) => v.id === selectedId) || ordered[0];

  const diffChunks = useMemo(() => {
    if (!selectedVersion) return [];
    return diffLines(selectedVersion.html, currentHtml);
  }, [selectedVersion, currentHtml]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulation Version History"
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-5xl h-[82vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
        <div className="h-12 shrink-0 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Version History & Diff Comparison
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Timeline list */}
          <div className="w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-3 flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/40">
            {ordered.map((ver) => {
              const isSelected = ver.id === selectedVersion?.id;
              const isExactCurrent = ver.html === currentHtml;
              return (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => setSelectedId(ver.id)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 border-blue-500'
                      : 'bg-transparent border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      v{ver.versionNumber} · {SOURCE_LABELS[ver.source]}
                    </span>
                    {isExactCurrent && (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 mb-1">
                    {ver.description}
                  </p>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {new Date(ver.createdAt).toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Diff / Source inspector */}
          <div className="flex-1 min-w-0 flex flex-col">
            {selectedVersion && (
              <>
                <div className="h-11 shrink-0 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <GitCompare className="w-4 h-4 text-slate-400" />
                    <span>
                      Comparing v{selectedVersion.versionNumber} against current active simulation
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => setCompareMode('diff')}
                        className={`px-2.5 py-1 rounded ${
                          compareMode === 'diff'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium'
                            : 'text-slate-500'
                        }`}
                      >
                        Diff
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareMode('preview')}
                        className={`px-2.5 py-1 rounded ${
                          compareMode === 'preview'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium'
                            : 'text-slate-500'
                        }`}
                      >
                        Snapshot Source
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onRestore(selectedVersion);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore v{selectedVersion.versionNumber}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 font-mono text-[11.5px] leading-relaxed bg-slate-50 dark:bg-slate-950">
                  {compareMode === 'diff' ? (
                    selectedVersion.html === currentHtml ? (
                      <div className="text-slate-500 dark:text-slate-400 text-xs font-sans">
                        This snapshot matches the current active simulation byte-for-byte.
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap break-all">
                        {diffChunks.map((part, idx) => (
                          <div
                            key={idx}
                            className={
                              part.added
                                ? 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
                                : part.removed
                                  ? 'bg-red-500/15 text-red-900 dark:text-red-200'
                                  : 'text-slate-600 dark:text-slate-400'
                            }
                          >
                            {part.value}
                          </div>
                        ))}
                      </pre>
                    )
                  ) : (
                    <pre className="whitespace-pre-wrap break-all text-slate-700 dark:text-slate-300">
                      {selectedVersion.html}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
