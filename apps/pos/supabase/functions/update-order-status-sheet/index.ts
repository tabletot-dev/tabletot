import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert base64 to ArrayBuffer for crypto key import
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Parse PEM private key and import as CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  
  const keyData = base64ToArrayBuffer(pemContents);
  
  return await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

// Get access token using service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: exp,
    iat: now,
  };
  
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  
  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok) {
    console.error("Token error:", tokenData);
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`);
  }
  
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, status } = await req.json();
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    console.log(`Updating order status in sheet: sessionId=${sessionId}, status=${status}`);

    if (!sheetId) {
      console.error("Missing GOOGLE_SHEET_ID");
      return new Response(
        JSON.stringify({ error: "Google Sheet ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!serviceAccountJson) {
      console.error("Missing GOOGLE_SERVICE_ACCOUNT_KEY");
      return new Response(
        JSON.stringify({ error: "Google Service Account not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (e) {
      console.error("Failed to parse service account JSON:", e);
      return new Response(
        JSON.stringify({ error: "Invalid service account configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);
    console.log("Successfully obtained access token");

    // First, read the sheet to find the row with matching session ID
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Orders!A:I`;
    const readResponse = await fetch(readUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!readResponse.ok) {
      const errorText = await readResponse.text();
      console.error("Google Sheets read error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to read Google Sheets", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sheetData = await readResponse.json();
    const rows = sheetData.values || [];
    
    // Find the row index with matching session ID (column B)
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row[1]) {
        const sheetSessionId = row[1].toString().trim();
        // Direct match - canonical order IDs should match exactly
        if (sheetSessionId === sessionId) {
          rowIndex = i + 1; // Sheets are 1-indexed
          console.log(`Found matching order at row ${rowIndex}: ${sheetSessionId}`);
          break;
        }
      }
    }

    if (rowIndex === -1) {
      console.log(`No matching order found for sessionId: ${sessionId}`);
      return new Response(
        JSON.stringify({ success: false, message: "Order not found in sheet" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the Status column (column G) for the found row
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Orders!G${rowIndex}?valueInputOption=USER_ENTERED`;
    
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[status.toUpperCase()]],
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Google Sheets update error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to update Google Sheets", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await updateResponse.json();
    console.log("Google Sheets update response:", JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, message: `Order status updated to ${status} in row ${rowIndex}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error updating order status:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
