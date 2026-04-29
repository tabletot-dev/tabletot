import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert base64 to ArrayBuffer for crypto operations
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Parse PEM private key and import as CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  const binaryKey = base64ToArrayBuffer(pemContents);
  
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

// Generate OAuth2 access token using service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: exp,
    iat: now,
  };
  
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  const jwt = `${signatureInput}.${signatureB64}`;
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting sync from Google Sheets...');
    
    const sheetId = Deno.env.get('GOOGLE_SHEET_ID');
    const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    
    if (!sheetId || !serviceAccountKey) {
      throw new Error('Missing Google Sheets configuration');
    }

    const serviceAccount = JSON.parse(serviceAccountKey);
    const accessToken = await getAccessToken(serviceAccount);
    
    // Read the KOT sheet to get table statuses
    // Assuming format: Table No | Status | ... (adjust range as needed)
    const range = 'KOT!A:G'; // Adjust based on your sheet structure
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
    
    console.log('Fetching data from Google Sheets...');
    
    const sheetsResponse = await fetch(sheetsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      console.error('Sheets API error:', errorText);
      throw new Error(`Failed to fetch from Google Sheets: ${sheetsResponse.status}`);
    }

    const sheetsData = await sheetsResponse.json();
    const rows = sheetsData.values || [];
    
    console.log(`Found ${rows.length} rows in sheet`);

    // Skip header row and process data
    // Map table numbers to their latest status from the sheet
    const tableStatusMap = new Map<string, string>();
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length >= 2) {
        const tableNo = row[0]?.toString().trim();
        const status = row[1]?.toString().trim().toLowerCase();
        
        if (tableNo && status) {
          // Map sheet status to table status
          let mappedStatus = 'available';
          
          if (status === 'pending' || status === 'new' || status === 'ordering') {
            mappedStatus = 'ordering';
          } else if (status === 'preparing' || status === 'in_progress' || status === 'cooking') {
            mappedStatus = 'preparing';
          } else if (status === 'ready' || status === 'served' || status === 'billing') {
            mappedStatus = 'billing';
          } else if (status === 'paid' || status === 'completed' || status === 'done') {
            mappedStatus = 'available';
          } else if (status === 'occupied') {
            mappedStatus = 'occupied';
          }
          
          // Keep the latest status for each table
          tableStatusMap.set(tableNo, mappedStatus);
        }
      }
    }

    console.log('Table status map:', Object.fromEntries(tableStatusMap));

    // Update tables in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updates: { table_number: string; status: string }[] = [];
    
    for (const [tableNo, status] of tableStatusMap) {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ status })
        .eq('table_number', tableNo);
      
      if (error) {
        console.error(`Error updating table ${tableNo}:`, error);
      } else {
        updates.push({ table_number: tableNo, status });
        console.log(`Updated table ${tableNo} to status: ${status}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${updates.length} tables from Google Sheets`,
        updates,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
