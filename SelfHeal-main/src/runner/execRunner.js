import { spawn } from 'child_process';
import { askCLIHealer } from '../agent/cliHealer.js';
import chalk from 'chalk';
import readline from 'readline';

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, answer => { rl.close(); resolve(answer.trim()); }));
}

export async function runCommandWithHealing(command) {
    console.log(chalk.dim(`$ ${command}`));

    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    return new Promise((resolve) => {
        let stderrData = '';
        
        // Spawn with shell: true so things like "npm run dev" or pipes might work eventually
        // But the first arg is the command. We will just pass the full command to spawn with shell: true
        const child = spawn(command, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });

        child.stdout.on('data', (data) => {
            process.stdout.write(data);
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data);
             // Limit capture to avoid memory bloat
            if (stderrData.length < 5000) {
                stderrData += data.toString();
            }
        });

        child.on('close', async (code) => {
            if (code === 0) {
                return resolve(0);
            }

            console.log(chalk.red(`\n[SelfHeal] Command failed with exit code ${code}. Diagnosing...`));
            
            const aiResult = await askCLIHealer(command, stderrData);
            
            if (aiResult && aiResult.fixed_command) {
                console.log(chalk.yellow(`\n[AI Explanation]: `) + aiResult.explanation);
                const answer = await askQuestion(chalk.cyan(`[SelfHeal] Do you want to run: `) + chalk.green(aiResult.fixed_command) + chalk.cyan(` ? (y/N) `));
                
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    console.log(chalk.blue(`\nRunning fixed command...\n`));
                    const resCode = await runCommandWithHealing(aiResult.fixed_command);
                    return resolve(resCode);
                } else {
                    console.log(chalk.dim(`\nAborted.\n`));
                    return resolve(code);
                }
            } else {
                console.log(chalk.yellow(`[SelfHeal] Could not determine a fix for this error.`));
                resolve(code);
            }
        });
    });
}
