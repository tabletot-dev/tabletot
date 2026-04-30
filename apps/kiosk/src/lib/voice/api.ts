export const BACKEND_HTTP = "http://localhost:8000";
export const BACKEND_WS = "ws://localhost:8000";

export async function startSession(
  tableId: string,
  restaurantId: string,
): Promise<string> {
  const res = await fetch(`${BACKEND_HTTP}/voice/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table_id: tableId, restaurant_id: restaurantId }),
  });
  if (!res.ok) {
    throw new Error(`session/start failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.session_id as string;
}

export async function endSession(sessionId: string): Promise<void> {
  await fetch(`${BACKEND_HTTP}/voice/session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}
