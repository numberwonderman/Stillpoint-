import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}
loadEnv();

const jwtSecret = process.env.JWT_SECRET;
const token = jwt.sign({ sub: 'test-user', email: 'test@example.com' }, jwtSecret, { expiresIn: '1h' });
const cookieString = `stillpoint_session=${token}`;
const API_URL = 'http://localhost:3000/api/support';
async function testResource() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieString
    },
    body: JSON.stringify({
      text: "I've been struggling with my mental health lately. Can you help me find someone I could talk to?",
      history: []
    }),
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let actualResponse = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        console.log(line);
      }
    }
  }
}

testResource().catch(console.error);
