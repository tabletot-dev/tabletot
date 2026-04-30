export const BACKEND_HTTP = "http://localhost:8000";
export const BACKEND_WS = "ws://localhost:8000";

export interface SessionIds {
  voiceSessionId: string;
  clientSessionId: string;
}

function getOrCreateClientSessionId(): string {
  const key = "tt_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function startSession(
  tableId: string,
  restaurantId: string,
): Promise<SessionIds> {
  const clientSessionId = getOrCreateClientSessionId();
  const res = await fetch(`${BACKEND_HTTP}/voice/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      table_id: tableId,
      restaurant_id: restaurantId,
      client_session_id: clientSessionId,
    }),
  });
  if (!res.ok) {
    throw new Error(`session/start failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { voiceSessionId: data.session_id as string, clientSessionId };
}

export async function endSession(sessionId: string): Promise<void> {
  await fetch(`${BACKEND_HTTP}/voice/session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}
