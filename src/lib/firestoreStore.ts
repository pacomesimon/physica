import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AgentResponseType,
  ChatMessage,
  SimulationProject,
  SimulationVersion,
  StudioSettings,
} from '../types/simulation';
import {
  BLUEPRINT_LIMITS,
  clampString,
  db,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
} from './firebase';
import { parseSimulationMetadata } from './metadataParser';
import { DEFAULT_SETTINGS } from './storage';

const VALID_RESPONSE_TYPES = new Set<AgentResponseType>([
  'new_simulation',
  'code_modification',
  'bug_fix',
  'explanation',
  'clarification',
]);

const VALID_VERSION_SOURCES = new Set<SimulationVersion['source']>([
  'initial',
  'ai',
  'manual',
  'restore',
]);

function timestampToMs(value: unknown, fallback = Date.now()): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

function normalizeSettings(raw: Partial<StudioSettings> | undefined, fallback: StudioSettings): StudioSettings {
  const theme = raw?.theme === 'dark' || raw?.theme === 'light' ? raw.theme : fallback.theme;
  const providerId =
    raw?.providerId === 'gemini' || raw?.providerId === 'openai-compatible'
      ? raw.providerId
      : fallback.providerId;
  const model = clampString(raw?.model || fallback.model, BLUEPRINT_LIMITS.MODEL_MAX_LEN, DEFAULT_SETTINGS.model);
  const autoSnapshot = typeof raw?.autoSnapshot === 'boolean' ? raw.autoSnapshot : fallback.autoSnapshot;
  const walkthroughVoiceURI = clampString(
    raw?.walkthroughVoiceURI ?? fallback.walkthroughVoiceURI ?? '',
    BLUEPRINT_LIMITS.VOICE_URI_MAX_LEN
  );
  return {
    theme,
    providerId,
    model,
    autoSnapshot,
    walkthroughVoiceURI,
  };
}

/**
 * Ensures the signed-in user's private profile document exists at /users/{uid}.
 * Returns the user's cloud-synced studio settings.
 */
export async function ensureUserProfileDoc(
  user: User,
  localSettings: StudioSettings
): Promise<StudioSettings> {
  const uid = sanitizeFirestoreId(user.uid, 'user');
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const displayName = clampString(user.displayName || 'Physica User', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX_LEN);
  const email = clampString(user.email || '', BLUEPRINT_LIMITS.EMAIL_MAX_LEN);
  const photoURL = clampString(user.photoURL || '', BLUEPRINT_LIMITS.PHOTO_URL_MAX_LEN);
  const normalized = normalizeSettings(localSettings, DEFAULT_SETTINGS);

  if (!snap.exists()) {
    try {
      await setDoc(userRef, {
        uid,
        displayName,
        email,
        photoURL,
        theme: normalized.theme,
        providerId: normalized.providerId,
        model: normalized.model,
        autoSnapshot: normalized.autoSnapshot,
        walkthroughVoiceURI: normalized.walkthroughVoiceURI || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
    return normalized;
  }

  const data = snap.data() as Partial<StudioSettings & { displayName?: string; email?: string; photoURL?: string }>;
  if (data.displayName !== displayName || data.email !== email || data.photoURL !== photoURL) {
    try {
      await updateDoc(userRef, {
        displayName,
        email,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  return normalizeSettings(data, localSettings);
}

export async function saveUserSettingsToCloud(uid: string, settings: StudioSettings): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const userPath = `users/${safeUid}`;
  const normalized = normalizeSettings(settings, DEFAULT_SETTINGS);
  try {
    await updateDoc(doc(db, 'users', safeUid), {
      theme: normalized.theme,
      providerId: normalized.providerId,
      model: normalized.model,
      autoSnapshot: normalized.autoSnapshot,
      walkthroughVoiceURI: normalized.walkthroughVoiceURI || '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export interface CloudProjectHeader {
  id: string;
  title: string;
  subject: string;
  description: string;
  currentHtml: string;
  versionCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Subscribes to the signed-in user's cloud projects collection in real time.
 * Always queries with where('ownerId', '==', uid) to satisfy hardened allow list rules.
 */
export function subscribeUserProjects(
  uid: string,
  onData: (projects: CloudProjectHeader[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const projectsPath = `users/${safeUid}/projects`;
  const q = query(
    collection(db, 'users', safeUid, 'projects'),
    where('ownerId', '==', safeUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CloudProjectHeader[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            title: typeof d.title === 'string' ? d.title : 'Untitled Simulation',
            subject: typeof d.subject === 'string' ? d.subject : 'Physics',
            description: typeof d.description === 'string' ? d.description : '',
            currentHtml: typeof d.currentHtml === 'string' ? d.currentHtml : '',
            versionCount: typeof d.versionCount === 'number' ? d.versionCount : 1,
            createdAt: timestampToMs(d.createdAt),
            updatedAt: timestampToMs(d.updatedAt),
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, projectsPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

/**
 * Loads versions and chat messages subcollections for a single cloud project.
 */
export async function loadProjectDetailsFromCloud(
  uid: string,
  projectId: string
): Promise<{ versions: SimulationVersion[]; messages: ChatMessage[] }> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeProjectId = sanitizeFirestoreId(projectId, 'proj');
  const versionsPath = `users/${safeUid}/projects/${safeProjectId}/versions`;
  const messagesPath = `users/${safeUid}/projects/${safeProjectId}/messages`;

  let versionDocs;
  try {
    const vQuery = query(
      collection(db, 'users', safeUid, 'projects', safeProjectId, 'versions'),
      where('ownerId', '==', safeUid)
    );
    versionDocs = await getDocs(vQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, versionsPath);
  }

  let messageDocs;
  try {
    const mQuery = query(
      collection(db, 'users', safeUid, 'projects', safeProjectId, 'messages'),
      where('ownerId', '==', safeUid)
    );
    messageDocs = await getDocs(mQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, messagesPath);
  }

  const versions: SimulationVersion[] = versionDocs.docs
    .map((docSnap) => {
      const d = docSnap.data();
      const html = typeof d.html === 'string' ? d.html : '';
      const source: SimulationVersion['source'] = VALID_VERSION_SOURCES.has(d.source)
        ? d.source
        : 'ai';
      return {
        id: docSnap.id,
        versionNumber: typeof d.versionNumber === 'number' ? d.versionNumber : 1,
        description: typeof d.description === 'string' ? d.description : 'Saved snapshot',
        html,
        source,
        createdAt: timestampToMs(d.createdAt),
        metadata: html ? parseSimulationMetadata(html) : undefined,
      };
    })
    .sort((a, b) => a.versionNumber - b.versionNumber);

  const messages: ChatMessage[] = messageDocs.docs
    .map((docSnap) => {
      const d = docSnap.data();
      const role: ChatMessage['role'] =
        d.role === 'user' || d.role === 'assistant' || d.role === 'system' ? d.role : 'assistant';
      return {
        id: docSnap.id,
        role,
        content: typeof d.content === 'string' ? d.content : '',
        createdAt: timestampToMs(d.createdAt),
        ...(VALID_RESPONSE_TYPES.has(d.responseType) ? { responseType: d.responseType } : {}),
        ...(typeof d.versionId === 'string' ? { versionId: d.versionId } : {}),
        ...(typeof d.isError === 'boolean' ? { isError: d.isError } : {}),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  return { versions, messages };
}

/**
 * Saves or updates a project document and appends any new version/message records to Firestore.
 */
export async function saveProjectToCloud(
  uid: string,
  project: SimulationProject,
  syncedVersionIds?: Set<string>,
  syncedMessageIds?: Set<string>
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeProjectId = sanitizeFirestoreId(project.id, 'proj');
  const projectPath = `users/${safeUid}/projects/${safeProjectId}`;
  const projectRef = doc(db, 'users', safeUid, 'projects', safeProjectId);

  const safeTitle = clampString(
    (project.title || '').trim() || 'Untitled Simulation',
    BLUEPRINT_LIMITS.PROJECT_TITLE_MAX_LEN,
    'Untitled Simulation'
  );
  const safeSubject = clampString(project.subject || 'Physics', BLUEPRINT_LIMITS.PROJECT_SUBJECT_MAX_LEN);
  const safeDescription = clampString(project.description || '', BLUEPRINT_LIMITS.PROJECT_DESC_MAX_LEN);
  const safeHtml = clampString(project.currentHtml || '<!DOCTYPE html><html><body></body></html>', BLUEPRINT_LIMITS.HTML_MAX_LEN);
  const safeVersionCount = Math.max(
    0,
    Math.min(BLUEPRINT_LIMITS.MAX_VERSION_NUMBER, project.versions.length || 1)
  );

  let existingSnap;
  try {
    existingSnap = await getDoc(projectRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, projectPath);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(projectRef, {
        ownerId: safeUid,
        title: safeTitle,
        subject: safeSubject,
        description: safeDescription,
        currentHtml: safeHtml,
        versionCount: safeVersionCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, projectPath);
    }
  } else {
    try {
      await updateDoc(projectRef, {
        title: safeTitle,
        subject: safeSubject,
        description: safeDescription,
        currentHtml: safeHtml,
        versionCount: safeVersionCount,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, projectPath);
    }
  }

  // Persist unsynced immutable version snapshots (cap to most recent 15 snapshots to stay lean)
  const versionsToSync = project.versions.slice(-15);
  for (const ver of versionsToSync) {
    const safeVerId = sanitizeFirestoreId(ver.id, 'ver');
    if (syncedVersionIds?.has(safeVerId)) continue;
    const verPath = `${projectPath}/versions/${safeVerId}`;
    const verRef = doc(db, 'users', safeUid, 'projects', safeProjectId, 'versions', safeVerId);
    try {
      const verSnap = await getDoc(verRef);
      if (!verSnap.exists()) {
        await setDoc(verRef, {
          ownerId: safeUid,
          projectId: safeProjectId,
          versionNumber: Math.max(1, Math.min(BLUEPRINT_LIMITS.MAX_VERSION_NUMBER, ver.versionNumber || 1)),
          description: clampString(ver.description || 'Snapshot', BLUEPRINT_LIMITS.VERSION_DESC_MAX_LEN),
          html: clampString(ver.html || safeHtml, BLUEPRINT_LIMITS.HTML_MAX_LEN),
          source: VALID_VERSION_SOURCES.has(ver.source) ? ver.source : 'ai',
          createdAt: serverTimestamp(),
        });
      }
      syncedVersionIds?.add(safeVerId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, verPath);
    }
  }

  // Persist unsynced chat messages (cap to most recent 40 messages)
  const messagesToSync = project.messages.slice(-40);
  for (const msg of messagesToSync) {
    const safeMsgId = sanitizeFirestoreId(msg.id, 'msg');
    if (syncedMessageIds?.has(safeMsgId)) continue;
    const msgPath = `${projectPath}/messages/${safeMsgId}`;
    const msgRef = doc(db, 'users', safeUid, 'projects', safeProjectId, 'messages', safeMsgId);
    const safeContent = clampString((msg.content || '').trim() || ' ', BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX_LEN);
    try {
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) {
        const payload: Record<string, unknown> = {
          ownerId: safeUid,
          projectId: safeProjectId,
          role: msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'assistant',
          content: safeContent,
          createdAt: serverTimestamp(),
        };
        if (msg.responseType && VALID_RESPONSE_TYPES.has(msg.responseType)) {
          payload.responseType = msg.responseType;
        }
        if (msg.versionId) {
          payload.versionId = sanitizeFirestoreId(msg.versionId, 'ver');
        }
        if (typeof msg.isError === 'boolean') {
          payload.isError = msg.isError;
        }
        await setDoc(msgRef, payload);
      }
      syncedMessageIds?.add(safeMsgId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, msgPath);
    }
  }
}

export async function deleteProjectFromCloud(uid: string, projectId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeProjectId = sanitizeFirestoreId(projectId, 'proj');
  const projectPath = `users/${safeUid}/projects/${safeProjectId}`;

  // Clean up subcollections first so no orphaned child records remain
  const subcollections = ['versions', 'messages'] as const;
  for (const sub of subcollections) {
    const subPath = `${projectPath}/${sub}`;
    try {
      const q = query(
        collection(db, 'users', safeUid, 'projects', safeProjectId, sub),
        where('ownerId', '==', safeUid)
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, subPath);
    }
  }

  try {
    await deleteDoc(doc(db, 'users', safeUid, 'projects', safeProjectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, projectPath);
  }
}
