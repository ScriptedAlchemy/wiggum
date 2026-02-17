import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const sourceDtsPath = path.join(distDir, 'index.d.ts');

if (!fs.existsSync(sourceDtsPath)) {
  throw new Error(`Declaration source file not found: ${sourceDtsPath}`);
}

const content = fs.readFileSync(sourceDtsPath, 'utf8');
const outputs = [
  path.join(distDir, 'index.d.mts'),
  path.join(distDir, 'index.d.cts'),
];

for (const outputPath of outputs) {
  fs.writeFileSync(outputPath, content, 'utf8');
}
