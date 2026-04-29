import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

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
  
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    privateKey
  );

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
    const kotData = await req.json();
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    console.log("Received KOT data:", JSON.stringify(kotData));

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

    // Format items as human-readable string:
    // <quantity>x <item name> (<comma-separated modifiers if any>)
    const itemsFormatted = kotData.items.map((item: any) => {
      const modifiers = item.modifiers && item.modifiers.length > 0 
        ? ` (${item.modifiers.join(", ")})` 
        : "";
      return `${item.quantity}x ${item.name}${modifiers}`;
    }).join("\n");
    
    // Use the canonical order_id passed from POS (no secondary ID generation)
    const sessionId = kotData.order_id;
    
    if (!sessionId) {
      console.error("Missing order_id in KOT data");
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Combine all notes as special instructions
    const specialInstructions = kotData.items
      .filter((item: any) => item.notes)
      .map((item: any) => `${item.name}: ${item.notes}`)
      .join("; ") || kotData.special_notes || "";

    const row = [
      new Date().toISOString(),             // Timestamp
      sessionId,                            // Session ID (canonical order_id from POS)
      itemsFormatted,                       // Items (human-readable string)
      kotData.total || 0,                   // Total
      "Walk-in Customer",                   // Customer Name
      specialInstructions,                  // Special Instructions
      "NEW",                                // Status
      "POS",                                // Kiosk ID
      kotData.table_no || "N/A",            // Table Number
    ];

    console.log("Row to append to Orders sheet:", JSON.stringify(row));

    // Append row to Google Sheet (Orders sheet for KDS)
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Orders!A:I:append?valueInputOption=USER_ENTERED`;

    const response = await fetch(appendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [row],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Sheets API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to sync to Google Sheets", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Google Sheets response:", JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, message: "KOT synced to Google Sheets for KDS" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error syncing KOT:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
