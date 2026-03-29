import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

function getApiKeys() {
  if (process.env.GEMINI_API_KEYS) {
    return process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  } else if (process.env.GEMINI_API_KEY) {
    return [process.env.GEMINI_API_KEY.trim()];
  }
  return [];
}

const apiKeys = getApiKeys();

/**
 * Sends a failed terminal command and its output to Gemini for diagnosis and correction.
 * @param {string} command The command the user typed.
 * @param {string} stderr The error output.
 * @returns {Promise<{explanation: string, fixed_command: string, confidence: number}>}
 */
export async function askCLIHealer(command, stderr) {
  const prompt = `You are an expert DevOps engineer and terminal auto-healing agent.
The user ran a terminal command which failed with an error.

ORIGINAL COMMAND:
${command}

ERROR OUTPUT (stderr):
${stderr.slice(0, 4000)}

Analyze the error and the intended command. Provide an explanation of what went wrong, and the exact corrected command the user should run.
Reply with ONLY JSON exactly like this, no markdown fences or other text:
{
  "explanation": "brief explanation of what the user did wrong or what went wrong in the system",
  "fixed_command": "exact command to run to fix the problem",
  "confidence": 0.95
}`;

  if (apiKeys.length === 0) {
    console.error(chalk.red('  ❌ No Gemini API keys found in .env (GEMINI_API_KEYS or GEMINI_API_KEY)'));
    return { explanation: 'API keys missing', fixed_command: null, confidence: 0 };
  }

  let lastError = null;

  for (const key of apiKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      let text = res.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const result = JSON.parse(text);

      return result;
    } catch (err) {
      lastError = err;
    }
  }

  console.error(chalk.red('  ❌ All Gemini API keys failed. Last error:'), lastError?.message);
  return { explanation: 'Gemini API failed', fixed_command: null, confidence: 0 };
}
