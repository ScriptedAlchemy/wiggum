#!/usr/bin/env node

import { execSync } from 'child_process';
import stripAnsi from 'strip-ansi';

try {
  // Get the latest failed CI run
  const runList = execSync('gh run list --branch feat/rename-plugin-wiggum-readmes --limit 1', { encoding: 'utf8' });
  const runId = runList.split('\t')[6]; // Extract run ID
  
  console.log('Getting CI logs for run ID:', runId);
  
  // Get the full logs
  const rawLogs = execSync(`gh run view ${runId} --log`, { encoding: 'utf8' });
  const cleanLogs = stripAnsi(rawLogs);
  
  // Look for error patterns
  const lines = cleanLogs.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for common error indicators
    if (line.includes('error') || 
        line.includes('failed') || 
        line.includes('ERROR') ||
        line.includes('FAILED') ||
        line.includes('Error:') ||
        line.includes('npm ERR!') ||
        line.includes('pnpm ERR!')) {
      
      console.log('\n🚨 POTENTIAL ERROR FOUND:');
      console.log('Line:', line);
      
      // Get surrounding context (5 lines before and after)
      const start = Math.max(0, i - 5);
      const end = Math.min(lines.length, i + 5);
      console.log('\nContext:');
      for (let j = start; j < end; j++) {
        const marker = j === i ? '>>> ' : '    ';
        console.log(`${marker}${lines[j]}`);
      }
      console.log('-------------------');
    }
    
    // Look for test failures
    if (line.includes('FAIL') || line.includes('✗') || line.includes('❌')) {
      console.log('\n❌ TEST FAILURE:');
      console.log('Line:', line);
    }
    
    // Look for build failures
    if (line.includes('build failed') || line.includes('compilation failed')) {
      console.log('\n🔨 BUILD FAILURE:');
      console.log('Line:', line);
    }
  }
  
} catch (error) {
  console.error('Error getting CI logs:', error.message);
}