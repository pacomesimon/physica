import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  History,
  PanelLeft,
  MessageSquare,
  Check,
  Pencil,
  ExternalLink,
  Link2,
  Loader2,
  Cloud,
  LogIn,
  LogOut,
  UploadCloud,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { copyTextToClipboard, type HostedSimulationLink } from '../lib/exporter';

interface TopBarProps {
  projectTitle: string;
  onRenameProject: (title: string) => void;
  versionCount: number;
  isDirty: boolean;
  lastSavedAt: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onOpenVersions: () => void;
  onOpenExport: () => void;
  hostedUrl: string | null;
  isPublishingHost: boolean;
  onEnsureHostedLink: () => Promise<HostedSimulationLink | null>;
  user: User | null;
  isSigningIn: boolean;
  cloudSyncStatus: 'local' | 'syncing' | 'synced' | 'error';
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncLocalToCloud: () => Promise<void>;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectTitle,
  onRenameProject,
  versionCount,
  isDirty,
  lastSavedAt,
  sidebarOpen,
  onToggleSidebar,
  chatOpen,
  onToggleChat,
  onOpenVersions,
  onOpenExport,
  hostedUrl,
  isPublishingHost,
  onEnsureHostedLink,
  user,
  isSigningIn,
  cloudSyncStatus,
  onSignIn,
  onSignOut,
  onSyncLocalToCloud,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(projectTitle);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [preparingPreview, setPreparingPreview] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftTitle(projectTitle);
  }, [projectTitle]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [accountMenuOpen]);

  const commitRename = () => {
    const cleaned = draftTitle.trim();
    if (cleaned && cleaned !== projectTitle) {
      onRenameProject(cleaned);
    } else {
      setDraftTitle(projectTitle);
    }
    setEditing(false);
  };

  const handleCopyLink = async () => {
    setCopyState('copying');
    try {
      let targetUrl = hostedUrl;
      if (!targetUrl) {
        const published = await onEnsureHostedLink();
        targetUrl = published?.url ?? null;
      }
      if (!targetUrl) {
        setCopyState('error');
        setTimeout(() => setCopyState('idle'), 2200);
        return;
      }
      const ok = await copyTextToClipboard(targetUrl);
      setCopyState(ok ? 'copied' : 'error');
      setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2200);
    }
  };

  const handlePrepareAndOpen = async () => {
    setPreparingPreview(true);
    try {
      const published = await onEnsureHostedLink();
      if (published?.url) {
        const link = document.createElement('a');
        link.href = published.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } finally {
      setPreparingPreview(false);
    }
  };

  const formattedSaved = new Date(lastSavedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const userInitial = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <header className="h-12 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Hide projects sidebar' : 'Show projects sidebar'}
          title={sidebarOpen ? 'Hide projects sidebar' : 'Show projects sidebar'}
          className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleChat}
          aria-label={chatOpen ? 'Hide AI chat panel' : 'Show AI chat panel'}
          title={chatOpen ? 'Hide AI chat panel' : 'Show AI chat panel'}
          className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <span className="font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 pl-1">
          Physica Studio
        </span>

        <span className="text-slate-300 dark:text-slate-700 select-none" aria-hidden="true">
          /
        </span>

        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraftTitle(projectTitle);
                  setEditing(false);
                }
              }}
              autoFocus
              aria-label="Project title"
              className="text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded px-2 py-0.5 text-slate-900 dark:text-slate-100 focus:outline-none w-52"
            />
            <button
              type="button"
              onClick={commitRename}
              aria-label="Save title"
              className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Click to rename simulation project"
            className="group flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white truncate max-w-[200px] rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="truncate">{projectTitle}</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-70 shrink-0" />
          </button>
        )}

        <span className="hidden xl:inline text-xs text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap shrink-0 pl-2">
          {user
            ? cloudSyncStatus === 'syncing'
              ? 'Syncing to Cloud…'
              : cloudSyncStatus === 'error'
                ? 'Saved locally (Cloud retry)'
                : `Cloud synced ${formattedSaved}`
            : isDirty
              ? 'Unsaved edits'
              : `Saved locally ${formattedSaved}`}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenVersions}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <History className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="hidden sm:inline">Versions ({versionCount})</span>
          <span className="sm:hidden">{versionCount}</span>
        </button>

        {hostedUrl ? (
          <a
            href={hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open hosted PWA simulation in a new tab"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden lg:inline">Preview Webpage</span>
            <span className="lg:hidden">Preview</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={handlePrepareAndOpen}
            disabled={preparingPreview || isPublishingHost}
            title="Publish and open hosted PWA simulation in a new tab"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {preparingPreview || isPublishingHost ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span className="hidden lg:inline">Preview Webpage</span>
            <span className="lg:hidden">Preview</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCopyLink}
          disabled={copyState === 'copying'}
          title={hostedUrl ? `Copy hosted PWA link: ${hostedUrl}` : 'Copy hosted PWA link'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {copyState === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-700 dark:text-emerald-400">Link Copied</span>
            </>
          ) : copyState === 'copying' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
              <span>Copying…</span>
            </>
          ) : copyState === 'error' ? (
            <>
              <Link2 className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-600 dark:text-red-400">Retry Copy</span>
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden lg:inline">Copy Link</span>
              <span className="lg:hidden">Copy</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Download HTML</span>
          <span className="md:hidden">Export</span>
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" aria-hidden="true" />

        {user ? (
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              title={`Signed in as ${user.email || user.displayName || 'Google User'} (Cloud Sync Active)`}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Account avatar'}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold inline-flex items-center justify-center">
                  {userInitial}
                </span>
              )}
              <Cloud
                className={`w-3.5 h-3.5 ${
                  cloudSyncStatus === 'syncing'
                    ? 'text-blue-500 animate-pulse'
                    : cloudSyncStatus === 'error'
                      ? 'text-amber-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              />
              <span className="hidden xl:inline max-w-[96px] truncate">
                {user.displayName?.split(' ')[0] || 'Account'}
              </span>
            </button>

            {accountMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1.5 z-50 text-xs"
              >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {user.displayName || 'Google Account'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <Cloud className="w-3 h-3" />
                    <span>
                      {cloudSyncStatus === 'syncing'
                        ? 'Syncing projects with Firestore…'
                        : 'Firestore cloud sync active'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void onSyncLocalToCloud();
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Sync Workspace to Cloud</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void onSignOut();
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sign Out (Continue as Guest)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void onSignIn()}
            disabled={isSigningIn}
            title="Optional: Sign in with Google to sync projects & preferences to Firestore"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {isSigningIn ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <LogIn className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
};
