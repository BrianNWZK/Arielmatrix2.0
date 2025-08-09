import fs from 'fs/promises';
import path from 'path';

async function checkSensitiveData() {
  const files = await fs.readdir('.', { recursive: true });
  const sensitivePatterns = [/0x[a-fA-F0-9]{40}/, /[a-z0-9]{32}/, /secret/i, /key/i];
  for (const file of files) {
    if (file.includes('node_modules') || file.includes('.git') || file.includes('api-keys.json')) continue;
    const content = await fs.readFile(file, 'utf8');
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        console.error(`Sensitive data detected in ${file}. Please move to environment variables.`);
        process.exit(1);
      }
    }
  }
  console.log('No sensitive data detected.');
  process.exit(0);
}

checkSensitiveData();
