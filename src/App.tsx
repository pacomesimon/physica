import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { ExportModal } from './components/ExportModal';
import { PreviewPanel } from './components/PreviewPanel';
import { ProjectSidebar } from './components/ProjectSidebar';
import { SettingsModal } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { parseSimulationMetadata } from './lib/metadataParser';
import {
  createBlankProject,
  createNextVersion,
  createSeededProjectileProject,
  LocalStorageRepository,
} from './lib/storage';
import type {
  AgentStructuredResponse,
  ChatMessage,
  ProviderOption,
  RuntimeDiagnostic,
  SimulationProject,
  SimulationVersion,
  StudioSettings,
} from './types/simulation';

const repository = new LocalStorageRepository();

const FALLBACK_PROVIDERS: ProviderOption[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    configured: true,
    defaultModel: 'gemini-4-hydrogen',
    availableModels: [
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Recommended)' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)' },
    ],
    description: 'Server-side @google/genai integration using GEMINI_API_KEY.',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-Compatible Endpoint',
    configured: false,
    defaultModel: 'gpt-4o-mini',
    availableModels: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }],
    description:
      'Configurable server-side endpoint for OpenAI, Ollama, LM Studio, vLLM, or OpenRouter.',
  },
];

export default function App() {
  const [projects, setProjects] = useState<SimulationProject[]>(() => repository.loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => repository.loadProjects()[0]?.id ?? ''
  );
  const [settings, setSettings] = useState<StudioSettings>(() => repository.loadSettings());
  const [providers, setProviders] = useState<ProviderOption[]>(FALLBACK_PROVIDERS);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(390);
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('preview');

  const [isGenerating, setIsGenerating] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostic[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    repository.saveSettings(settings);
  }, [settings]);

  // Persist projects
  useEffect(() => {
    repository.saveProjects(projects);
    setIsDirty(false);
  }, [projects]);

  // Fetch configured LLM providers from server
  useEffect(() => {
    fetch('/api/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { providers?: ProviderOption[] } | null) => {
        if (data?.providers && Array.isArray(data.providers) && data.providers.length > 0) {
          setProviders(data.providers);
        }
      })
      .catch(() => {
        // Keep fallback metadata if offline
      });
  }, []);

  const updateActiveProject = useCallback(
    (updater: (prev: SimulationProject) => SimulationProject) => {
      setIsDirty(true);
      setProjects((prevList) =>
        prevList.map((proj) => (proj.id === activeProject.id ? updater(proj) : proj))
      );
    },
    [activeProject.id]
  );

  const handleRenameProject = (newTitle: string) => {
    updateActiveProject((proj) => ({
      ...proj,
      title: newTitle,
      updatedAt: Date.now(),
    }));
  };

  const handleNewProject = () => {
    const count = projects.length + 1;
    const blank = createBlankProject(`Simulation ${count}`);
    setProjects((prev) => [blank, ...prev]);
    setActiveProjectId(blank.id);
    setDiagnostics([]);
  };

  const handleRestoreDemo = () => {
    const demo = createSeededProjectileProject();
    demo.id = `proj-demo-${Date.now()}`;
    setProjects((prev) => [demo, ...prev]);
    setActiveProjectId(demo.id);
    setDiagnostics([]);
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (remaining.length === 0) {
        const seeded = createSeededProjectileProject();
        setActiveProjectId(seeded.id);
        return [seeded];
      }
      if (id === activeProjectId) {
        setActiveProjectId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleAddDiagnostic = useCallback((diag: RuntimeDiagnostic) => {
    setDiagnostics((prev) => {
      if (prev.some((d) => d.message === diag.message && Date.now() - d.timestamp < 2000)) {
        return prev;
      }
      return [...prev.slice(-19), diag];
    });
  }, []);

  const handleClearDiagnostics = useCallback(() => {
    setDiagnostics([]);
  }, []);

  const handleApplyManualCode = (newHtml: string) => {
    const metadata = parseSimulationMetadata(newHtml);
    updateActiveProject((proj) => {
      const nextVer = createNextVersion(
        proj,
        newHtml,
        'Manual source code edit in studio editor',
        'manual'
      );
      return {
        ...proj,
        title: metadata.title !== 'Untitled Simulation' ? metadata.title : proj.title,
        subject: metadata.subject || proj.subject,
        currentHtml: newHtml,
        versions: [...proj.versions, nextVer],
        updatedAt: Date.now(),
      };
    });
    setDiagnostics([]);
  };

  const handleRestoreVersion = (version: SimulationVersion) => {
    updateActiveProject((proj) => {
      const restoredSnap = createNextVersion(
        proj,
        version.html,
        `Restored snapshot from v${version.versionNumber}`,
        'restore'
      );
      const restoreMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Restored simulation to snapshot v${version.versionNumber} (${version.description}).`,
        createdAt: Date.now(),
        responseType: 'explanation',
        versionId: restoredSnap.id,
      };
      return {
        ...proj,
        currentHtml: version.html,
        versions: [...proj.versions, restoredSnap],
        messages: [...proj.messages, restoreMsg],
        updatedAt: Date.now(),
      };
    });
    setDiagnostics([]);
  };

  const handleRestoreVersionById = (versionId: string) => {
    const found = activeProject.versions.find((v) => v.id === versionId);
    if (found) {
      handleRestoreVersion(found);
    }
  };

  const handleSendPrompt = async (prompt: string) => {
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    };

    const conversationSnapshot = [...activeProject.messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    updateActiveProject((proj) => ({
      ...proj,
      messages: [...proj.messages, userMsg],
      updatedAt: Date.now(),
    }));

    setIsGenerating(true);

    try {
      const response = await fetch('/api/agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: prompt,
          conversation: conversationSnapshot,
          currentHtml: activeProject.currentHtml,
          runtimeErrors: diagnostics.filter((d) => d.level === 'error'),
          providerId: settings.providerId,
          model: settings.model,
        }),
      });

      const payload = (await response.json()) as AgentStructuredResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || `Request failed with status ${response.status}`);
      }

      const nextHtml = payload.html?.trim();
      const expectsCodeUpdate =
        payload.responseType === 'new_simulation' ||
        payload.responseType === 'code_modification' ||
        payload.responseType === 'bug_fix';

      if (expectsCodeUpdate && !nextHtml) {
        throw new Error(
          'The simulation agent did not return updated HTML code for this request. Please retry.'
        );
      }

      let createdVersionId: string | undefined;

      updateActiveProject((proj) => {
        let updatedVersions = proj.versions;
        let updatedHtml = proj.currentHtml;
        let updatedTitle = proj.title;
        let updatedSubject = proj.subject;

        if (nextHtml) {
          const prevMeta = parseSimulationMetadata(proj.currentHtml);
          const meta = parseSimulationMetadata(nextHtml);
          updatedHtml = nextHtml;

          if (
            meta.title &&
            meta.title !== 'Untitled Simulation' &&
            (payload.responseType === 'new_simulation' || meta.title !== prevMeta.title)
          ) {
            updatedTitle = meta.title;
          }
          if (meta.subject) {
            updatedSubject = meta.subject;
          }

          if (settings.autoSnapshot) {
            const ver = createNextVersion(proj, nextHtml, payload.summary, 'ai');
            createdVersionId = ver.id;
            updatedVersions = [...proj.versions, ver];
          }
        }

        const assistantMsg: ChatMessage = {
          id: `msg-ai-${Date.now()}`,
          role: 'assistant',
          content: payload.summary,
          createdAt: Date.now(),
          responseType: payload.responseType,
          changedSections: payload.changedSections,
          physicsAssumptions: payload.physicsAssumptions,
          educationalNotes: payload.educationalNotes,
          clarificationQuestion: payload.clarificationQuestion,
          versionId: createdVersionId,
        };

        return {
          ...proj,
          title: updatedTitle,
          subject: updatedSubject,
          currentHtml: updatedHtml,
          versions: updatedVersions,
          messages: [...proj.messages, assistantMsg],
          updatedAt: Date.now(),
        };
      });

      if (nextHtml) {
        setDiagnostics([]);
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Failed to reach AI agent.';
      const errMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: errMessage,
        createdAt: Date.now(),
        isError: true,
      };
      updateActiveProject((proj) => ({
        ...proj,
        messages: [...proj.messages, errMsg],
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAskAiToFix = (errorSummary: string) => {
    setChatOpen(true);
    setMobileView('chat');
    handleSendPrompt(
      `Fix the runtime/validation error in the current simulation without breaking existing physics controls:\n${errorSummary}`
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        projectTitle={activeProject.title}
        onRenameProject={handleRenameProject}
        versionCount={activeProject.versions.length}
        isDirty={isDirty}
        lastSavedAt={activeProject.updatedAt}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onOpenVersions={() => setVersionsModalOpen(true)}
        onOpenExport={() => setExportModalOpen(true)}
      />

      {/* Mobile workspace switcher */}
      <div className="md:hidden shrink-0 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-2">
        <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 w-full">
          <button
            type="button"
            onClick={() => setMobileView('chat')}
            className={`flex-1 py-1.5 text-xs font-medium rounded ${
              mobileView === 'chat'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            AI Chat Agent
          </button>
          <button
            type="button"
            onClick={() => setMobileView('preview')}
            className={`flex-1 py-1.5 text-xs font-medium rounded ${
              mobileView === 'preview'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Simulation Preview
          </button>
        </div>
      </div>

      {/* Main 3-Part Workspace */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {sidebarOpen && (
          <div className="hidden md:flex h-full">
            <ProjectSidebar
              projects={projects}
              activeProjectId={activeProject.id}
              onSelectProject={(id) => {
                setActiveProjectId(id);
                setDiagnostics([]);
              }}
              onNewProject={handleNewProject}
              onRestoreDemo={handleRestoreDemo}
              onDeleteProject={handleDeleteProject}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
          </div>
        )}

        {chatOpen && (
          <div
            className={`${
              mobileView === 'chat' ? 'flex w-full md:w-auto' : 'hidden md:flex'
            } h-full`}
          >
            <ChatPanel
              messages={activeProject.messages}
              isGenerating={isGenerating}
              settings={settings}
              width={chatWidth}
              onWidthChange={setChatWidth}
              onClose={() => setChatOpen(false)}
              onSendMessage={handleSendPrompt}
              onRestoreVersion={handleRestoreVersionById}
              onRetryPrompt={handleSendPrompt}
            />
          </div>
        )}

        <div
          className={`${
            mobileView === 'preview' ? 'flex' : 'hidden md:flex'
          } flex-1 min-w-0 h-full`}
        >
          <PreviewPanel
            html={activeProject.currentHtml}
            theme={settings.theme}
            preferredVoice={settings.walkthroughVoiceURI}
            diagnostics={diagnostics}
            onAddDiagnostic={handleAddDiagnostic}
            onClearDiagnostics={handleClearDiagnostics}
            onAskAiToFix={handleAskAiToFix}
            onApplyManualCode={handleApplyManualCode}
          />
        </div>
      </main>

      {versionsModalOpen && (
        <VersionHistoryModal
          versions={activeProject.versions}
          currentHtml={activeProject.currentHtml}
          onRestore={handleRestoreVersion}
          onClose={() => setVersionsModalOpen(false)}
        />
      )}

      {exportModalOpen && (
        <ExportModal
          html={activeProject.currentHtml}
          projectTitle={activeProject.title}
          preferredVoice={settings.walkthroughVoiceURI}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          settings={settings}
          providers={providers}
          onUpdateSettings={(updates) => setSettings((prev) => ({ ...prev, ...updates }))}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}
    </div>
  );
}
