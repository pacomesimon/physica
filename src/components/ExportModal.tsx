import React, { useMemo, useState } from 'react';
import { Download, X, CheckCircle2, AlertTriangle, Globe } from 'lucide-react';
import { downloadStandaloneHtml, prepareStandaloneExport } from '../lib/exporter';

interface ExportModalProps {
  html: string;
  projectTitle: string;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ html, projectTitle, onClose }) => {
  const pkg = useMemo(() => prepareStandaloneExport(html, projectTitle), [html, projectTitle]);
  const [filename, setFilename] = useState(pkg.filename);
  const [exported, setExported] = useState(false);

  const handleDownload = () => {
    downloadStandaloneHtml(html, filename);
    setExported(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export Standalone HTML Simulation"
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Export Standalone Simulation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 text-xs">
          <div>
            <label
              htmlFor="export-filename"
              className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Output Filename
            </label>
            <input
              id="export-filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50 dark:bg-slate-950/50 flex flex-col gap-2">
            <div className="font-medium text-slate-800 dark:text-slate-200">
              Standalone Readiness Checks
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              {pkg.validation.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>
                {pkg.validation.valid
                  ? 'Valid HTML5 document with Three.js and zero studio secrets'
                  : pkg.validation.errors.join(' ')}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 tabular-nums">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                AI-friendly metadata & {pkg.validation.sectionCount}/10 documented code sections
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 tabular-nums">
              {pkg.validation.hasWalkthroughConfig &&
              pkg.validation.hasWalkthroughEngine &&
              pkg.validation.hasSimulationApi &&
              (pkg.validation.missingHighlightSelectors?.length ?? 0) === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span>
                {pkg.validation.hasWalkthroughConfig
                  ? `Guided Walkthrough embedded (${pkg.validation.walkthroughSegmentCount ?? 0} segments · ${pkg.validation.hasSimulationApi ? 'simulationAPI ready' : 'missing simulationAPI'}${(pkg.validation.missingHighlightSelectors?.length ?? 0) > 0 ? ` · missing selectors: ${pkg.validation.missingHighlightSelectors?.join(', ')}` : ' · all highlight selectors verified'})`
                  : 'No Guided Walkthrough configured in this simulation'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 tabular-nums">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Package size: {(pkg.byteSize / 1024).toFixed(1)} KB · Preview bridge stripped
              </span>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                CDN Dependency Notice:{' '}
              </span>
              Students can open this HTML file directly in any modern browser without an account or
              backend server. However, internet access is required to load Three.js from the CDN (
              {pkg.cdnDependencies.length > 0 ? pkg.cdnDependencies[0] : 'jsDelivr CDN'}).
            </div>
          </div>

          {exported && (
            <div className="text-emerald-700 dark:text-emerald-400 font-medium">
              Exported {filename} successfully. Open it directly in Chrome, Firefox, Edge, or Safari
              to verify standalone execution.
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!pkg.validation.valid}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 rounded-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {filename}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
