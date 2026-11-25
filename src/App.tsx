import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ChatPanel } from './components/ChatPanel';
import { ExportModal } from './components/ExportModal';
import { PreviewPanel } from './components/PreviewPanel';
import { ProjectSidebar } from './components/ProjectSidebar';
import { SettingsModal } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { useFirebaseAuth } from './contexts/FirebaseContext';
import { parseSimulationMetadata } from './lib/metadataParser';
import {
  publishStandaloneSimulation,
  type HostedSimulationLink,
} from './lib/exporter';
import {
  deleteProjectFromCloud,
  ensureUserProfileDoc,
  loadProjectDetailsFromCloud,
  saveProjectToCloud,
  saveUserSettingsToCloud,
  subscribeUserProjects,
  type CloudProjectHeader,
} from './lib/firestoreStore';
import { sanitizeFirestoreId } from './lib/firebase';
import {
  createBlankProject,
  createNextVersion,
  createSeededDoublePendulumProject,
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

function extractReadableCloudError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // Plain error message
  }
  return raw || 'Unable to sync with cloud right now. Your changes are still saved locally.';
}

export default function App() {
  const {
    user,
    authReady,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useFirebaseAuth();

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
  const [hostedLink, setHostedLink] = useState<HostedSimulationLink | null>(null);
  const [isPublishingHost, setIsPublishingHost] = useState(false);

  // Optional Firestore cloud sync state (guests remain in 'local' mode with zero Firestore traffic)
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudProfileReadyUid, setCloudProfileReadyUid] = useState<string | null>(null);
  const [cloudSyncTick, setCloudSyncTick] = useState(0);
  const [cloudSnapshotTick, setCloudSnapshotTick] = useState(0);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  const syncedVersionIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const syncedMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const hydratedProjectIdsRef = useRef<Set<string>>(new Set());
  const cloudKnownIdsRef = useRef<Set<string>>(new Set());
  const pendingCloudSyncIdsRef = useRef<Set<string>>(new Set());

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  const queueProjectForCloudSync = useCallback((projectId: string) => {
    pendingCloudSyncIdsRef.current.add(projectId);
    setCloudSyncTick((t) => t + 1);
  }, []);

  const getProjectSyncSets = useCallback((projectId: string) => {
    const safeId = sanitizeFirestoreId(projectId, 'proj');
    let vSet = syncedVersionIdsRef.current.get(safeId);
    if (!vSet) {
      vSet = new Set<string>();
      syncedVersionIdsRef.current.set(safeId, vSet);
    }
    let mSet = syncedMessageIdsRef.current.get(safeId);
    if (!mSet) {
      mSet = new Set<string>();
      syncedMessageIdsRef.current.set(safeId, mSet);
    }
    return { vSet, mSet };
  }, []);

  const publishActiveSimulation = useCallback(async (): Promise<HostedSimulationLink | null> => {
    setIsPublishingHost(true);
    try {
      const published = await publishStandaloneSimulation(
        activeProject.currentHtml,
        activeProject.title,
        settings.walkthroughVoiceURI
      );
      setHostedLink(published);
      return published;
    } catch {
      return null;
    } finally {
      setIsPublishingHost(false);
    }
  }, [activeProject.currentHtml, activeProject.title, settings.walkthroughVoiceURI]);

  // Keep hosted PWA webpage link synchronized with active simulation changes
  useEffect(() => {
    let cancelled = false;
    setHostedLink(null);
    const timer = window.setTimeout(() => {
      setIsPublishingHost(true);
      publishStandaloneSimulation(
        activeProject.currentHtml,
        activeProject.title,
        settings.walkthroughVoiceURI
      )
        .then((published) => {
          if (!cancelled) {
            setHostedLink(published);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHostedLink(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsPublishingHost(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProject.currentHtml, activeProject.title, settings.walkthroughVoiceURI]);

  // Sync theme class on <html> and persist settings locally
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    repository.saveSettings(settings);
  }, [settings]);

  // Persist projects locally (always active for both guests and signed-in users as offline cache)
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

  // Optional Firestore cloud sync lifecycle: ONLY attaches when user explicitly signs in
  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setCloudProfileReadyUid(null);
      setCloudSyncStatus('local');
      setCloudError(null);
      syncedVersionIdsRef.current.clear();
      syncedMessageIdsRef.current.clear();
      hydratedProjectIdsRef.current.clear();
      cloudKnownIdsRef.current.clear();
      pendingCloudSyncIdsRef.current.clear();
      return;
    }

    let cancelled = false;
    let unsubscribeProjects: (() => void) | null = null;
    let handledInitialSnapshot = false;

    setCloudSyncStatus('syncing');
    setCloudError(null);

    const bootstrapCloud = async () => {
      try {
        const cloudSettings = await ensureUserProfileDoc(user, settingsRef.current);
        if (cancelled) return;

        setSettings(cloudSettings);
        setCloudProfileReadyUid(user.uid);

        unsubscribeProjects = subscribeUserProjects(
          user.uid,
          async (cloudHeaders: CloudProjectHeader[]) => {
            if (cancelled) return;

            cloudKnownIdsRef.current = new Set(cloudHeaders.map((h) => h.id));

            // First sign-in with an empty cloud workspace: automatically preserve current local projects
            if (!handledInitialSnapshot && cloudHeaders.length === 0) {
              handledInitialSnapshot = true;
              const localProjects = projectsRef.current;
              try {
                for (const proj of localProjects) {
                  if (cancelled) return;
                  const { vSet, mSet } = getProjectSyncSets(proj.id);
                  await saveProjectToCloud(user.uid, proj, vSet, mSet);
                  hydratedProjectIdsRef.current.add(sanitizeFirestoreId(proj.id, 'proj'));
                }
                if (!cancelled) {
                  setCloudSyncStatus('synced');
                }
              } catch (err) {
                if (!cancelled) {
                  setCloudSyncStatus('error');
                  setCloudError(extractReadableCloudError(err));
                }
              }
              return;
            }

            handledInitialSnapshot = true;

            if (cloudHeaders.length > 0) {
              setProjects((prevLocal) => {
                const localById = new Map(prevLocal.map((p) => [p.id, p]));
                const merged: SimulationProject[] = cloudHeaders.map((header) => {
                  const existing = localById.get(header.id);
                  if (existing) {
                    const htmlChanged = existing.currentHtml !== header.currentHtml;
                    if (htmlChanged) {
                      hydratedProjectIdsRef.current.delete(header.id);
                    }
                    return {
                      ...existing,
                      title: header.title,
                      subject: header.subject,
                      description: header.description,
                      currentHtml: header.currentHtml || existing.currentHtml,
                      createdAt: header.createdAt,
                      updatedAt: header.updatedAt,
                    };
                  }

                  const initialVersion: SimulationVersion = {
                    id: `ver-cloud-${header.id}`,
                    versionNumber: Math.max(1, header.versionCount || 1),
                    description: 'Synced from cloud',
                    html: header.currentHtml,
                    source: 'initial',
                    createdAt: header.updatedAt,
                    metadata: header.currentHtml ? parseSimulationMetadata(header.currentHtml) : undefined,
                  };

                  return {
                    id: header.id,
                    title: header.title,
                    subject: header.subject,
                    description: header.description,
                    currentHtml: header.currentHtml,
                    versions: [initialVersion],
                    messages: [],
                    createdAt: header.createdAt,
                    updatedAt: header.updatedAt,
                  };
                });

                const mergedIds = new Set(merged.map((p) => p.id));
                if (!mergedIds.has(activeProjectIdRef.current) && merged[0]) {
                  setActiveProjectId(merged[0].id);
                }

                return merged;
              });
            }

            if (!cancelled) {
              setCloudSnapshotTick((t) => t + 1);
              setCloudSyncStatus('synced');
            }
          },
          (err) => {
            if (!cancelled) {
              setCloudSyncStatus('error');
              setCloudError(extractReadableCloudError(err));
            }
          }
        );
      } catch (err) {
        if (!cancelled) {
          setCloudSyncStatus('error');
          setCloudError(extractReadableCloudError(err));
        }
      }
    };

    void bootstrapCloud();

    return () => {
      cancelled = true;
      if (unsubscribeProjects) {
        unsubscribeProjects();
      }
    };
  }, [authReady, user, getProjectSyncSets]);

  // Hydrate subcollections (versions & chat messages) when selecting a cloud project
  useEffect(() => {
    if (!user || cloudProfileReadyUid !== user.uid || !activeProjectId) return;
    const safeId = sanitizeFirestoreId(activeProjectId, 'proj');
    if (!cloudKnownIdsRef.current.has(safeId)) return;
    if (hydratedProjectIdsRef.current.has(safeId)) return;

    let cancelled = false;

    loadProjectDetailsFromCloud(user.uid, safeId)
      .then(({ versions, messages }) => {
        if (cancelled) return;
        hydratedProjectIdsRef.current.add(safeId);
        const { vSet, mSet } = getProjectSyncSets(safeId);
        versions.forEach((v) => vSet.add(sanitizeFirestoreId(v.id, 'ver')));
        messages.forEach((m) => mSet.add(sanitizeFirestoreId(m.id, 'msg')));

        setProjects((prev) =>
          prev.map((proj) => {
            if (proj.id !== activeProjectId && sanitizeFirestoreId(proj.id, 'proj') !== safeId) {
              return proj;
            }
            return {
              ...proj,
              versions: versions.length > 0 ? versions : proj.versions,
              messages: messages.length > 0 ? messages : proj.messages,
            };
          })
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setCloudSyncStatus('error');
          setCloudError(extractReadableCloudError(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, cloudProfileReadyUid, activeProjectId, cloudSnapshotTick, getProjectSyncSets]);

  // Flush queued local project edits to Firestore when signed in
  useEffect(() => {
    if (!user || cloudProfileReadyUid !== user.uid) return;
    if (pendingCloudSyncIdsRef.current.size === 0) return;

    const idsToSync = Array.from(pendingCloudSyncIdsRef.current);
    pendingCloudSyncIdsRef.current.clear();

    const targets = idsToSync
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is SimulationProject => Boolean(p));

    if (targets.length === 0) return;

    let cancelled = false;
    setCloudSyncStatus('syncing');

    (async () => {
      try {
        for (const proj of targets) {
          if (cancelled) return;
          const { vSet, mSet } = getProjectSyncSets(proj.id);
          await saveProjectToCloud(user.uid, proj, vSet, mSet);
          cloudKnownIdsRef.current.add(sanitizeFirestoreId(proj.id, 'proj'));
          hydratedProjectIdsRef.current.add(sanitizeFirestoreId(proj.id, 'proj'));
        }
        if (!cancelled) {
          setCloudSyncStatus('synced');
          setCloudError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCloudSyncStatus('error');
          setCloudError(extractReadableCloudError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, cloudProfileReadyUid, projects, cloudSyncTick, getProjectSyncSets]);

  const handleSyncLocalToCloud = useCallback(async () => {
    if (!user || cloudProfileReadyUid !== user.uid) return;
    setCloudSyncStatus('syncing');
    setCloudError(null);
    try {
      for (const proj of projectsRef.current) {
        const { vSet, mSet } = getProjectSyncSets(proj.id);
        await saveProjectToCloud(user.uid, proj, vSet, mSet);
        cloudKnownIdsRef.current.add(sanitizeFirestoreId(proj.id, 'proj'));
        hydratedProjectIdsRef.current.add(sanitizeFirestoreId(proj.id, 'proj'));
      }
      setCloudSyncStatus('synced');
    } catch (err) {
      setCloudSyncStatus('error');
      setCloudError(extractReadableCloudError(err));
    }
  }, [user, cloudProfileReadyUid, getProjectSyncSets]);

  const handleUpdateSettings = useCallback(
    (updates: Partial<StudioSettings>) => {
      const next = { ...settingsRef.current, ...updates };
      setSettings(next);
      if (user && cloudProfileReadyUid === user.uid) {
        setCloudSyncStatus('syncing');
        saveUserSettingsToCloud(user.uid, next)
          .then(() => {
            setCloudSyncStatus('synced');
            setCloudError(null);
          })
          .catch((err) => {
            setCloudSyncStatus('error');
            setCloudError(extractReadableCloudError(err));
          });
      }
    },
    [user, cloudProfileReadyUid]
  );

  const updateActiveProject = useCallback(
    (updater: (prev: SimulationProject) => SimulationProject) => {
      const targetId = activeProject.id;
      setIsDirty(true);
      setProjects((prevList) =>
        prevList.map((proj) => (proj.id === targetId ? updater(proj) : proj))
      );
      if (user && cloudProfileReadyUid === user.uid) {
        queueProjectForCloudSync(targetId);
      }
    },
    [activeProject.id, user, cloudProfileReadyUid, queueProjectForCloudSync]
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
    if (user && cloudProfileReadyUid === user.uid) {
      queueProjectForCloudSync(blank.id);
    }
  };

  const handleRestoreDemo = () => {
    const demo = createSeededDoublePendulumProject();
    demo.id = `proj-demo-${Date.now()}`;
    setProjects((prev) => [demo, ...prev]);
    setActiveProjectId(demo.id);
    setDiagnostics([]);
    if (user && cloudProfileReadyUid === user.uid) {
      queueProjectForCloudSync(demo.id);
    }
  };

  const handleDeleteProject = (id: string) => {
    const remaining = projectsRef.current.filter((p) => p.id !== id);
    let createdFallback: SimulationProject | null = null;

    if (remaining.length === 0) {
      createdFallback = createSeededDoublePendulumProject();
      setProjects([createdFallback]);
      setActiveProjectId(createdFallback.id);
    } else {
      setProjects(remaining);
      if (id === activeProjectId) {
        setActiveProjectId(remaining[0].id);
      }
    }

    if (user && cloudProfileReadyUid === user.uid) {
      const safeId = sanitizeFirestoreId(id, 'proj');
      cloudKnownIdsRef.current.delete(safeId);
      hydratedProjectIdsRef.current.delete(safeId);
      syncedVersionIdsRef.current.delete(safeId);
      syncedMessageIdsRef.current.delete(safeId);
      setCloudSyncStatus('syncing');
      deleteProjectFromCloud(user.uid, id)
        .then(() => {
          setCloudSyncStatus('synced');
        })
        .catch((err) => {
          setCloudSyncStatus('error');
          setCloudError(extractReadableCloudError(err));
        });

      if (createdFallback) {
        queueProjectForCloudSync(createdFallback.id);
      }
    }
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
        hostedUrl={hostedLink?.url ?? null}
        isPublishingHost={isPublishingHost}
        onEnsureHostedLink={publishActiveSimulation}
        user={user}
        isSigningIn={isSigningIn}
        cloudSyncStatus={cloudSyncStatus}
        onSignIn={signInWithGoogle}
        onSignOut={signOutUser}
        onSyncLocalToCloud={handleSyncLocalToCloud}
      />

      {(authError || cloudError) && (
        <div
          role="alert"
          className="shrink-0 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">
              {authError || cloudError} (Your work remains saved locally.)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAuthError();
              setCloudError(null);
            }}
            aria-label="Dismiss cloud notice"
            className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/60 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
          hostedUrl={hostedLink?.url ?? null}
          onEnsureHostedLink={publishActiveSimulation}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          settings={settings}
          providers={providers}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}
    </div>
  );
}
