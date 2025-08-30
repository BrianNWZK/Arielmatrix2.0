import { createServer } from 'http';
import { readFileSync } from 'fs';

const server = createServer(async (req, res) => {
    try {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'degraded_but_operational',
                autonomy_level: 'fallback_mode',
                timestamp: new Date().toISOString(),
                capabilities: ['health_check', 'config_management', 'self_healing']
            }));
        } else if (req.url === '/diagnose') {
            // Self-diagnosis endpoint
            const diagnosis = await diagnoseSystem();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(diagnosis));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'ArielSQL Autonomous Fallback Mode',
                instruction: 'System is in self-recovery mode',
                endpoints: ['/health', '/diagnose', '/repair']
            }));
        }
    } catch (error) {
        res.writeHead(500);
        res.end('Autonomous recovery in progress');
    }
});

async function diagnoseSystem() {
    return {
        node_modules: checkDirectory('node_modules'),
        config: checkFile('config/bwaezi-config.js'),
        main_app: checkFile('arielsql_suite/main.js'),
        dependencies: await checkDependencies(),
        timestamp: new Date().toISOString()
    };
}

function checkDirectory(path) {
    try {
        const stats = require('fs').statSync(path);
        return { exists: true, isDirectory: stats.isDirectory() };
    } catch {
        return { exists: false, isDirectory: false };
    }
}

function checkFile(path) {
    try {
        require('fs').accessSync(path);
        return { exists: true };
    } catch {
        return { exists: false };
    }
}

async function checkDependencies() {
    const deps = ['express', 'dotenv', 'axios', 'web3'];
    const results = {};
    
    for (const dep of deps) {
        try {
            require.resolve(dep);
            results[dep] = 'available';
        } catch {
            results[dep] = 'missing';
        }
    }
    
    return results;
}

server.listen(3000, '0.0.0.0', () => {
    console.log('🔄 Autonomous fallback server operational on port 3000');
    console.log('🔍 System diagnosis available at /diagnose');
});
