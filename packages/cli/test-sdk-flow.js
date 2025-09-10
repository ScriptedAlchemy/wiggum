#!/usr/bin/env node

/**
 * Test full SDK flow:
 * 1. Start server
 * 2. Create session
 * 3. Launch TUI with that session
 * 4. Append prompt via SDK
 */

import { createOpencodeClient } from '@opencode-ai/sdk';
import { createOpencodeTui } from './src/opencode.js';
import chalk from 'chalk';
import { spawn } from 'child_process';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper for createOpencodeTui with default config
 */
function createCustomOpencodeTui(options = {}) {
  console.log(chalk.gray('   Creating opencode TUI with options:', JSON.stringify(options, null, 2)));

  // Default config for testing
  const defaultConfig = {
    model: 'anthropic/claude-3-5-sonnet-20241022',
    temperature: 0.7,
    max_tokens: 4096,
    tools: {
      webfetch: true,
      filesystem: true
    }
  };

  const tuiOptions = {
    project: process.cwd(),
    model: 'anthropic/claude-3-5-sonnet-20241022',
    config: defaultConfig,
    ...options
  };

  return createOpencodeTui(tuiOptions);
}

async function main() {
  let server;
  let tui;
  let client;
  const port = 4097;
  const hostname = '127.0.0.1';
  const serverUrl = `http://${hostname}:${port}`;

  // Step 1: Start opencode server using SDK
  server = await createOpencodeServer({
    port: port,
    hostname: hostname,
  });

  // Step 2: Create client to connect to server
  client = createOpencodeClient({
    baseUrl: server.url,
    responseStyle: 'data'
  });

  // Step 3: Create session via the server
  const session = await client.session.create({
    body: {
      title: 'Test Session with Pre-populated Error Context'
    }
  });

  // Step 4: Stop the opencode server
  server.close();
  await sleep(1000);

  // Step 5: Start opencode TUI with the existing session
  tui = createCustomOpencodeTui({
    port: port,
    hostname: hostname,
    project: process.cwd(),
    model: 'github/gpt-4.1',
    session: session.id,  // Pass the session ID to TUI
    config: {
      // Any additional config
    }
  });

  // Wait for TUI to be ready
  await sleep(3000);

  // Step 6: Recreate client to connect to TUI's server
  client = createOpencodeClient({
    baseUrl: serverUrl
  });

  // Step 7: Use client to interact with the session
  const promptText = `I encountered an error while running the wiggum CLI:

Error: Command failed with exit code 1
  at /Users/bytedance/wiggum/packages/cli/src/agent.ts:95

Please help me debug this issue.`;

  // Send prompt directly to the session
  const promptResult = await client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ 
        type: 'text', 
        text: promptText 
      }],
      model: {
        providerID: 'github',
        modelID: 'gpt-4.1'
      }
    }
  });

  // Wait to see if TUI updates
  await sleep(2000);

  client.tui.submitPrompt();
  client.tui.submitPrompt();
  client.tui.submitPrompt();
client.tui.showToast({
body:'testinf'
})
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    if (tui) {
      tui.close();
    }
    if (server) {
      server.close();
    }
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => { });
}

// Run the test
main();