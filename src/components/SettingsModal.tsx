import React from 'react';
import { X, Sun, Moon } from 'lucide-react';
import type { LLMProviderId, ProviderOption, StudioSettings } from '../types/simulation';

interface SettingsModalProps {
  settings: StudioSettings;
  providers: ProviderOption[];
  onUpdateSettings: (updates: Partial<StudioSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  providers,
  onUpdateSettings,
  onClose,
}) => {
  const activeProvider =
    providers.find((p) => p.id === settings.providerId) || providers[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Provider and Studio Settings"
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Provider & Studio Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 text-xs">
          {/* Provider Selection */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-2">
              Server-Side LLM Provider Adapter
            </label>
            <div className="flex flex-col gap-2">
              {providers.map((provider) => {
                const selected = provider.id === settings.providerId;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        providerId: provider.id as LLMProviderId,
                        model: provider.defaultModel,
                      })
                    }
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {provider.label}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          provider.configured
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {provider.configured ? 'Configured on server' : 'Not configured in env'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {provider.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              API credentials remain strictly on the server via environment secrets (GEMINI_API_KEY
              or OPENAI_COMPAT_BASE_URL / OPENAI_COMPAT_API_KEY).
            </p>
          </div>

          {/* Model Selection */}
          {activeProvider && (
            <div>
              <label
                htmlFor="settings-model"
                className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Active Model
              </label>
              <select
                id="settings-model"
                value={settings.model}
                onChange={(e) => onUpdateSettings({ model: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-500"
              >
                {activeProvider.availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Theme */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="font-medium text-slate-800 dark:text-slate-200">Studio Appearance</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Switch between light editorial and dark engineering themes
              </div>
            </div>
            <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 font-medium shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded ${
                  settings.theme === 'dark'
                    ? 'bg-slate-900 text-slate-100 font-medium shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Auto-snapshot */}
          <label className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <div className="font-medium text-slate-800 dark:text-slate-200">
                Automatic Version Snapshots
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Save a recoverable version after every successful AI modification
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.autoSnapshot}
              onChange={(e) => onUpdateSettings({ autoSnapshot: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
          </label>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
