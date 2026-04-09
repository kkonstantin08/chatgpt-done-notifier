import { RUNTIME_SESSIONS_STORAGE_KEY, RUNTIME_STALE_MS } from '../shared/constants';
import type { RuntimeTabSession } from '../shared/types';

type RuntimeSessionMap = Record<string, RuntimeTabSession>;

async function getSessionMap(): Promise<RuntimeSessionMap> {
  const stored = await chrome.storage.session.get(RUNTIME_SESSIONS_STORAGE_KEY);
  return (stored[RUNTIME_SESSIONS_STORAGE_KEY] as RuntimeSessionMap | undefined) ?? {};
}

async function setSessionMap(sessionMap: RuntimeSessionMap): Promise<void> {
  await chrome.storage.session.set({
    [RUNTIME_SESSIONS_STORAGE_KEY]: sessionMap
  });
}

export async function getRuntimeSession(tabId: number): Promise<RuntimeTabSession | null> {
  const sessionMap = await getSessionMap();
  return sessionMap[String(tabId)] ?? null;
}

export async function upsertRuntimeSession(session: RuntimeTabSession): Promise<void> {
  const sessionMap = await getSessionMap();
  sessionMap[String(session.tabId)] = session;
  await setSessionMap(sessionMap);
}

export async function removeRuntimeSession(tabId: number): Promise<void> {
  const sessionMap = await getSessionMap();
  delete sessionMap[String(tabId)];
  await setSessionMap(sessionMap);
}

export async function pruneRuntimeSessions(validTabIds?: number[]): Promise<void> {
  const sessionMap = await getSessionMap();
  const validIdSet = validTabIds ? new Set(validTabIds.map(String)) : null;
  const now = Date.now();

  for (const [tabId, session] of Object.entries(sessionMap)) {
    const stale = now - session.lastUpdatedAt > RUNTIME_STALE_MS;
    const missing = validIdSet ? !validIdSet.has(tabId) : false;

    if (stale || missing) {
      delete sessionMap[tabId];
    }
  }

  await setSessionMap(sessionMap);
}
