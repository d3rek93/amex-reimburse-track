import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  date: string;
  description: string;
  originalAmount?: number;
  originalCurrency?: string;
  conversionFees?: number;
  amountEur: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileName, fileContent } = await req.json();
    
    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      console.error('Error fetching user from JWT:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing PDF for user:', user.id);

    // Decode base64 file content
    const binaryString = atob(fileContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    const text = await extractTextFromPDF(arrayBuffer);
    
    console.log('Extracted text length:', text.length);
    console.log('First 1000 chars:', text.substring(0, 1000));
    
    // Parse transactions from the text
    const transactions = parseAmexTransactions(text);
    
    // Insert transactions into database
    const { data: expenses, error: insertError } = await supabaseClient
      .from('expenses')
      .insert(
        transactions.map(t => ({
          user_id: user.id,
          date: t.date,
          description: t.description,
          original_amount: t.originalAmount,
          original_currency: t.originalCurrency,
          conversion_fees: t.conversionFees,
          amount_eur: t.amountEur,
        }))
      )
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        transactionsCount: transactions.length,
        expenses 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Starting basic PDF text extraction');
    
    // Convert to string and look for text patterns
    const uint8Array = new Uint8Array(arrayBuffer);
    let text = '';
    
    // Decode as latin1 to preserve all bytes
    for (let i = 0; i < uint8Array.length; i++) {
      text += String.fromCharCode(uint8Array[i]);
    }
    
    console.log('Raw PDF length:', text.length);
    
    // Extract text between parentheses (PDF text objects)
    const textMatches = text.match(/\((.*?)\)/gs);
    let extractedText = '';
    
    if (textMatches) {
      console.log('Found', textMatches.length, 'text objects');
      extractedText = textMatches
        .map(match => match.slice(1, -1)) // Remove parentheses
        .join(' ')
        .replace(/\\([nrt])/g, ' ') // Replace escape sequences
        .replace(/\s+/g, ' '); // Normalize whitespace
    }
    
    // Also try to extract from streams
    const streamPattern = /stream\s+([\s\S]*?)\s+endstream/g;
    let streamMatch;
    while ((streamMatch = streamPattern.exec(text)) !== null) {
      const streamContent = streamMatch[1];
      // Look for readable text in stream
      const readableText = streamContent.match(/[a-zA-Z0-9\s€$£¥.,;:!?()-]+/g);
      if (readableText) {
        extractedText += ' ' + readableText.join(' ');
      }
    }
    
    console.log('Extracted text length:', extractedText.length);
    console.log('First 1000 chars:', extractedText.substring(0, 1000));
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

function parseAmexTransactions(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  
  console.log('Total lines to parse:', lines.length);
  console.log('First 20 lines:', lines.slice(0, 20));
  
  // Look for transaction lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match transaction pattern: date | date | description | foreign amount | EUR amount
    // Example: "29 sept | 29 sept | UBER TRIP | HTTPS://HELP.UB | 29,28"
    const transactionRegex = /(\d{1,2}\s+\w+)\s*\|\s*(\d{1,2}\s+\w+)\s*\|\s*([^|]+)(?:\|([^|]+))?\|\s*([\d,]+(?:\.\d{2})?)/;
    const match = line.match(transactionRegex);
    
    if (match) {
      const [, , , description, foreignAmountStr, eurAmountStr] = match;
      
      // Parse EUR amount
      const amountEur = parseFloat(eurAmountStr.replace(',', '.'));
      
      // Check if there's a foreign currency amount
      let originalAmount: number | undefined;
      let originalCurrency: string | undefined;
      let conversionFees: number | undefined;
      
      if (foreignAmountStr && foreignAmountStr.trim()) {
        // Try to extract amount and currency from foreign amount string
        // Example: "173.75 franc suisse"
        const foreignMatch = foreignAmountStr.match(/([\d,\.]+)\s*([a-zA-Z\s]+)/);
        if (foreignMatch) {
          originalAmount = parseFloat(foreignMatch[1].replace(',', '.'));
          originalCurrency = foreignMatch[2].trim();
          
          // Calculate conversion fees (rough estimate)
          conversionFees = amountEur - originalAmount;
          if (conversionFees < 0) conversionFees = Math.abs(conversionFees);
        }
      }
      
      // Convert date format (e.g., "29 sept" to "2025-09-29")
      const date = convertDateFormat(match[1]);
      
      transactions.push({
        date,
        description: description.trim(),
        originalAmount,
        originalCurrency,
        conversionFees,
        amountEur,
      });
    }
  }
  
  console.log('Total transactions found:', transactions.length);
  
  return transactions;
}

function convertDateFormat(dateStr: string): string {
  const months: { [key: string]: string } = {
    'janv': '01', 'févr': '02', 'mars': '03', 'avr': '04',
    'mai': '05', 'juin': '06', 'juil': '07', 'août': '08',
    'sept': '09', 'oct': '10', 'nov': '11', 'déc': '12'
  };
  
  const [day, monthFr] = dateStr.split(/\s+/);
  const month = months[monthFr] || '01';
  const currentYear = new Date().getFullYear();
  
  return `${currentYear}-${month}-${day.padStart(2, '0')}`;
}
