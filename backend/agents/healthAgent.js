import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
const execPromise = util.promisify(exec);

export const healthAgent = async (CONFIG) => {
  try {
    // Check Node.js version
    const { stdout: nodeVersion } = await execPromise('node -v');
    if (!nodeVersion.includes('22.16.0')) {
      throw new Error('Incorrect Node.js version');
    }
    // Install missing dependencies
    const dependencies = ['terser', 'puppeteer'];
    for (const dep of dependencies) {
      try {
        require(dep);
      } catch {
        console.log(`Installing ${dep}...`);
        await execPromise(`npm install ${dep} --save-dev`);
      }
    }
    // Monitor logs and ensure no sensitive data
    const { stdout } = await execPromise('tail -n 100 /var/log/app.log || true');
    if (stdout.includes('key') || stdout.includes('secret') || stdout.includes('0x')) {
      console.log('Sensitive data detected in logs, cleaning...');
      await fs.writeFile('/var/log/app.log', '');
    }
    if (stdout.includes('error')) {
      console.log('Detected error, restarting agents...');
      throw new Error('Log error detected');
    }
  } catch (error) {
    console.error('HealthAgent Error:', error);
    throw error;
  }
};
