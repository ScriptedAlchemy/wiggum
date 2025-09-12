#!/usr/bin/env node

import { execSync } from 'child_process';
import stripAnsi from 'strip-ansi';

try {
  const runList = execSync('gh run list --branch feat/rename-plugin-wiggum-readmes --limit 1', { encoding: 'utf8' });
  const runId = runList.split('\t')[6]; 
  
  const rawLogs = execSync(`gh run view ${runId} --log`, { encoding: 'utf8' });
  const cleanLogs = stripAnsi(rawLogs);
  
  // Find the specific snapshot failures
  const lines = cleanLogs.split('\n');
  let foundFailures = false;
  
  console.log('=== SNAPSHOT TEST FAILURES ===\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('Snapshot `') && line.includes('mismatched')) {
      foundFailures = true;
      console.log('❌ SNAPSHOT MISMATCH:');
      console.log(line.split('packages/cli test: ')[1] || line);
      
      // Get the next few lines for expected vs received
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.includes('- Expected') || 
            nextLine.includes('+ Received') || 
            nextLine.includes('- "') || 
            nextLine.includes('+ "')) {
          console.log(nextLine.split('packages/cli test: ')[1] || nextLine);
        }
        if (nextLine.includes('FAIL ') && j > i + 2) break;
      }
      console.log('---');
    }
  }
  
  if (!foundFailures) {
    console.log('No snapshot failures found. Looking for other errors...');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('Process completed with exit code') && !line.includes('exit code 0')) {
        console.log('❌ PROCESS EXIT CODE:', line);
      }
    }
  }
  
} catch (error) {
  console.error('Error:', error.message);
}