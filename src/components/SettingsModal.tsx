import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Sun, Moon, Volume2, Square } from 'lucide-react';
import {
  BROWSER_DEFAULT_VOICE_VALUE,
  findDefaultGoogleEnglishVoice,
  selectWalkthroughVoice,
} from '../lib/walkthrough/engine';
import type { LLMProviderId, ProviderOption, StudioSettings } from '../types/simulation';

interface SettingsModalProps {
  settings: StudioSettings;
  providers: ProviderOption[];
  onUpdateSettings: (updates: Partial<StudioSettings>) => void;
  onClose: () => void;
}

const VOICE_PREVIEW_SAMPLE =
  'Welcome to this interactive 3D physics simulation. Adjust the controls below to observe how physical parameters shape the motion.';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  providers,
  onUpdateSettings,
  onClose,
}) => {
  const activeProvider =
    providers.find((p) => p.id === settings.providerId) || providers[0];

  const speechSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);

  const loadAvailableVoices = useCallback(() => {
    if (!speechSupported) return;
    try {
      const list = window.speechSynthesis.getVoices() || [];
      setVoices(list);
    } catch {
      setVoices([]);
    }
  }, [speechSupported]);

  useEffect(() => {
    if (!speechSupported) return;
    loadAvailableVoices();

    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadAvailableVoices);
    }
    return () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', loadAvailableVoices);
      }
      try {
        synth.cancel();
      } catch {
        // Ignore speech cancel error on unmount
      }
    };
  }, [speechSupported, loadAvailableVoices]);

  const sortedVoices = useMemo(() => {
    return [...voices].sort((a, b) => {
      if (a.default !== b.default) return a.default ? -1 : 1;
      const aEn = a.lang.toLowerCase().startsWith('en');
      const bEn = b.lang.toLowerCase().startsWith('en');
      if (aEn !== bEn) return aEn ? -1 : 1;
      const langCmp = a.lang.localeCompare(b.lang);
      if (langCmp !== 0) return langCmp;
      return a.name.localeCompare(b.name);
    });
  }, [voices]);

  const defaultGoogleVoice = useMemo(
    () => findDefaultGoogleEnglishVoice(sortedVoices),
    [sortedVoices]
  );

  const selectedDropdownValue = useMemo(() => {
    const saved = (settings.walkthroughVoiceURI || '').trim();
    if (saved === BROWSER_DEFAULT_VOICE_VALUE) {
      return BROWSER_DEFAULT_VOICE_VALUE;
    }
    if (saved) {
      const exists = sortedVoices.some((v) => v.voiceURI === saved || v.name === saved);
      if (exists) {
        const match = sortedVoices.find((v) => v.voiceURI === saved || v.name === saved);
        return match ? match.voiceURI : saved;
      }
    }
    return defaultGoogleVoice ? defaultGoogleVoice.voiceURI : BROWSER_DEFAULT_VOICE_VALUE;
  }, [settings.walkthroughVoiceURI, sortedVoices, defaultGoogleVoice]);

  const stopVoicePreview = useCallback(() => {
    if (!speechSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cancel error
    }
    setIsPreviewingVoice(false);
  }, [speechSupported]);

  const handlePreviewVoice = () => {
    if (!speechSupported) return;
    if (isPreviewingVoice) {
      stopVoicePreview();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(VOICE_PREVIEW_SAMPLE);
      const matchedVoice = selectWalkthroughVoice(
        sortedVoices,
        settings.walkthroughVoiceURI,
        'en-US'
      );

      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }

      utterance.onstart = () => setIsPreviewingVoice(true);
      utterance.onend = () => setIsPreviewingVoice(false);
      utterance.onerror = () => setIsPreviewingVoice(false);

      setIsPreviewingVoice(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsPreviewingVoice(false);
    }
  };

  const handleVoiceChange = (voiceURI: string) => {
    stopVoicePreview();
    onUpdateSettings({ walkthroughVoiceURI: voiceURI });
  };

  const handleClose = () => {
    stopVoicePreview();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Provider and Studio Settings"
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="h-12 shrink-0 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Provider & Studio Settings
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close settings"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-5 text-xs">
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

          {/* Walkthrough Narration Voice */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label
              htmlFor="settings-walkthrough-voice"
              className="block font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Guided Walkthrough Voice
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              Select a browser speech synthesis voice for narrated simulation walkthroughs.
            </p>
            <div className="flex items-center gap-2">
              <select
                id="settings-walkthrough-voice"
                value={selectedDropdownValue}
                disabled={!speechSupported}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value={BROWSER_DEFAULT_VOICE_VALUE}>
                  Browser Default (Auto-match language)
                </option>
                {sortedVoices.map((voice, idx) => (
                  <option key={`${voice.voiceURI}-${idx}`} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}){voice.default ? ' · Default' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!speechSupported}
                onClick={handlePreviewVoice}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPreviewingVoice
                    ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                }`}
              >
                {isPreviewingVoice ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </>
                )}
              </button>
            </div>
            {!speechSupported ? (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Web Speech synthesis is unavailable in this browser. Walkthroughs will run in
                synchronized silent transcript mode.
              </p>
            ) : sortedVoices.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                No system voices reported yet; the browser default voice will be used.
              </p>
            ) : null}
          </div>

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

        <div className="px-5 py-3 shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
