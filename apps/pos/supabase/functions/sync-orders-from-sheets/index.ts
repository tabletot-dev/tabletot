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

// Parse items string into JSON array
function parseItems(itemsStr: string): any[] {
  if (!itemsStr) return [];
  
  try {
    // Try parsing as JSON first
    return JSON.parse(itemsStr);
  } catch {
    // If not JSON, parse as comma-separated or line-separated items
    const items = itemsStr.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
    return items.map((item, idx) => {
      // Try to extract quantity and item name (e.g., "2x Pizza" or "Pizza x2")
      const qtyMatch = item.match(/^(\d+)\s*[xX]\s*(.+)$/) || item.match(/^(.+)\s*[xX]\s*(\d+)$/);
      if (qtyMatch) {
        const qty = parseInt(qtyMatch[1]) || parseInt(qtyMatch[2]) || 1;
        const name = qtyMatch[2] || qtyMatch[1];
        return { item_name: name.trim(), qty, line_total: 0 };
      }
      return { item_name: item, qty: 1, line_total: 0 };
    });
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting sync orders from Google Sheets...');
    
    const sheetId = Deno.env.get('GOOGLE_SHEET_ID');
    const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    
    if (!sheetId || !serviceAccountKey) {
      throw new Error('Missing Google Sheets configuration');
    }

    const serviceAccount = JSON.parse(serviceAccountKey);
    const accessToken = await getAccessToken(serviceAccount);
    
    // Read the Orders sheet
    // Columns: A=Timestamp, B=Session ID, C=Items, D=Total, E=Customer Name, F=Special Instructions, G=Status, H=Kiosk ID, I=Table Number
    const range = 'Orders!A:I';
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
    
    console.log('Fetching orders from Google Sheets...');
    
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
    
    console.log(`Found ${rows.length} rows in Orders sheet`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get existing order IDs to avoid duplicates (check all sources)
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('order_id');
    
    const existingOrderIds = new Set((existingOrders || []).map(o => o.order_id));
    console.log(`Found ${existingOrderIds.size} existing orders`);

    const newOrders: any[] = [];
    const updatedOrders: any[] = [];

    // Skip header row and process data
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;

      const timestamp = row[0]?.toString().trim() || '';
      const sessionId = row[1]?.toString().trim() || '';
      const itemsStr = row[2]?.toString().trim() || '';
      const totalStr = row[3]?.toString().trim() || '0';
      const customerName = row[4]?.toString().trim() || '';
      const specialInstructions = row[5]?.toString().trim() || '';
      const status = row[6]?.toString().trim().toLowerCase() || 'new';
      const kioskId = row[7]?.toString().trim() || '';
      const tableNumber = row[8]?.toString().trim() || '';

      if (!sessionId) continue;

      // Use session ID directly as order_id (no prefix - canonical ID from source)
      const orderId = sessionId;
      
      // Parse total
      const total = parseFloat(totalStr.replace(/[^0-9.]/g, '')) || 0;
      const subtotal = total / 1.05; // Assuming 5% tax
      const tax = total - subtotal;

      // Parse items
      const itemsJson = parseItems(itemsStr);
      
      // Add customer name and special instructions to items metadata
      if (customerName || specialInstructions) {
        itemsJson.push({
          item_name: `[Customer: ${customerName || 'Guest'}]`,
          qty: 0,
          line_total: 0,
          notes: specialInstructions
        });
      }

      // Map sheet status to order status
      let mappedStatus = 'new';
      if (status.includes('paid')) {
        mappedStatus = 'paid'; // PAID orders should not be reloaded
      } else if (status.includes('preparing') || status.includes('cooking')) {
        mappedStatus = 'preparing';
      } else if (status.includes('ready')) {
        mappedStatus = 'ready';
      } else if (status.includes('served') || status.includes('completed') || status.includes('done')) {
        mappedStatus = 'completed';
      } else if (status.includes('cancelled') || status.includes('canceled')) {
        mappedStatus = 'cancelled';
      } else if (status.includes('pending') || status.includes('new')) {
        mappedStatus = 'new';
      }

      // Parse timestamp
      let createdAt = new Date().toISOString();
      if (timestamp) {
        try {
          const parsedDate = new Date(timestamp);
          if (!isNaN(parsedDate.getTime())) {
            createdAt = parsedDate.toISOString();
          }
        } catch {
          console.log('Could not parse timestamp:', timestamp);
        }
      }

      if (existingOrderIds.has(orderId)) {
        // Update existing order status if changed
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            status: mappedStatus,
            updated_at: new Date().toISOString()
          })
          .eq('order_id', orderId);
        
        if (!updateError) {
          updatedOrders.push({ order_id: orderId, status: mappedStatus, table_no: tableNumber });
          
          // Update table status based on order status
          if (tableNumber) {
            let tableStatus = 'preparing';
            if (mappedStatus === 'paid') {
              tableStatus = 'available'; // PAID = Free (green) - table is cleared
            } else if (mappedStatus === 'ready') {
              tableStatus = 'billing'; // Ready = Billing (red)
            } else if (mappedStatus === 'completed') {
              tableStatus = 'paid'; // Completed = Paid (grey)
            } else if (mappedStatus === 'cancelled') {
              tableStatus = 'available';
            } else if (mappedStatus === 'preparing') {
              tableStatus = 'preparing'; // Preparing = Blue
            }
            
            console.log(`Updating table ${tableNumber} status to ${tableStatus} (order status: ${mappedStatus})`);
            
            // Build update object - clear order reference for paid/completed/cancelled
            const tableUpdate: any = { 
              status: tableStatus,
              updated_at: new Date().toISOString()
            };
            
            // Clear current_order_id when order is paid, completed, or cancelled
            if (mappedStatus === 'paid' || mappedStatus === 'completed' || mappedStatus === 'cancelled') {
              tableUpdate.current_order_id = null;
            }
            
            await supabase
              .from('restaurant_tables')
              .update(tableUpdate)
              .eq('table_number', tableNumber);
          }
        }
      } else {
        // Insert new order
        const orderData = {
          order_id: orderId,
          order_type: 'dine-in',
          table_no: tableNumber || null,
          status: mappedStatus,
          subtotal: Math.round(subtotal * 100) / 100,
          tax: Math.round(tax * 100) / 100,
          total: Math.round(total * 100) / 100,
          items_json: itemsJson,
          source: 'Tabletot',
          created_at: createdAt,
          synced_to_sheets: true
        };

        const { error: insertError } = await supabase
          .from('orders')
          .insert(orderData);

        if (insertError) {
          console.error(`Error inserting order ${orderId}:`, insertError);
        } else {
          newOrders.push({ order_id: orderId, table_no: tableNumber });
          existingOrderIds.add(orderId);
          console.log(`Inserted new order: ${orderId}`);
          
          // Update table status based on order status
          if (tableNumber) {
            let tableStatus = 'preparing';
            if (mappedStatus === 'ready') {
              tableStatus = 'billing';
            } else if (mappedStatus === 'completed') {
              tableStatus = 'paid';
            } else if (mappedStatus === 'cancelled') {
              tableStatus = 'available';
            }
            
            const { error: tableUpdateError } = await supabase
              .from('restaurant_tables')
              .update({ 
                status: tableStatus,
                updated_at: new Date().toISOString()
              })
              .eq('table_number', tableNumber);
            
            if (tableUpdateError) {
              console.error(`Error updating table ${tableNumber} status:`, tableUpdateError);
            } else {
              console.log(`Updated table ${tableNumber} to ${tableStatus}`);
            }
          }
        }
      }
    }

    console.log(`Sync complete: ${newOrders.length} new, ${updatedOrders.length} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${newOrders.length} new orders, updated ${updatedOrders.length} orders`,
        newOrders,
        updatedOrders,
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
