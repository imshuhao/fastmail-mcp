// Minimal local test runner for the Fastmail MCP server (stdio)
// - Loads env vars from .env without logging secrets
// - Spawns the server over stdio
// - Lists tools and calls a safe diagnostic tool

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filePath) {
  const env = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) env[key] = value;
    }
  } catch {
    // ignore missing .env
  }
  return env;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const envPath = path.join(repoRoot, '.env');
  const localEnv = loadDotEnv(envPath);

  // Prepare client
  const client = new Client({ name: 'fastmail-mcp-local-test', version: '0.1.0' }, { capabilities: { tools: {} } });

  // Spawn server via stdio with env from .env
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(repoRoot, 'dist', 'index.js')],
    env: { ...process.env, ...localEnv },
    stderr: 'inherit',
  });

  await client.connect(transport);

  // List tools
  const list = await client.listTools({});
  const toolNames = list.tools?.map(t => t.name) || [];
  console.log(`Server ready. Tools available: ${toolNames.length}`);
  console.log(toolNames.join(', '));

  // Call a safe diagnostic tool
  if (toolNames.includes('check_function_availability')) {
    const result = await client.callTool({ name: 'check_function_availability', arguments: {} });
    const text = result.content?.find(c => c.type === 'text')?.text;
    console.log('check_function_availability -> OK');
    if (text) {
      // Print a brief summary only
      try {
        const parsed = JSON.parse(text);
        const summary = {
          emailAvailable: !!parsed?.email?.available,
          contactsAvailable: !!parsed?.contacts?.available,
          calendarAvailable: !!parsed?.calendar?.available,
          capabilitiesCount: Array.isArray(parsed?.capabilities) ? parsed.capabilities.length : undefined,
        };
        console.log('Capability summary:', summary);
      } catch {
        console.log('Capability summary (raw text) length:', text.length);
      }
    }
  } else {
    console.log('Diagnostic tool not found: check_function_availability');
  }

  await client.close();
}

main().catch(err => {
  console.error('Local test failed:', err?.message || err);
  process.exit(1);
});
