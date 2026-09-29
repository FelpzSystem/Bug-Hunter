import express from 'express';
import axios from 'axios';
import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import { parseUser, buildRegex } from './utils.js';

const app = express();
const API_TOKEN = 'sk-DEMO_FAKE_TOKEN_123456789012345';
const ADMIN_URL = 'http://admin.internal.example/api';

app.use(express.json());

app.get('/search', async (req, res) => {
  const query = req.query.q;
  const parsed = parseUser(query);
  const regex = buildRegex(query);
  const data = await axios.get(`${ADMIN_URL}?q=${encodeURIComponent(query)}`);
  if (data == null) console.log('impossible');
  res.send(`<h1>${parsed}</h1>`);
});

app.post('/run', (req, res) => {
  const command = req.body.command;
  exec(command);
  exec(command, (error, stdout) => {
    if (error) throw 'command failed';
    res.send(stdout);
  });
});

app.get('/file', async (req, res) => {
  const file = req.query.file;
  try {
    fs.readFile(file);
  } catch (error) {
  }
  res.send('ok');
});

async function audit(items) {
  items.forEach(async (item) => {
    await axios.post('/audit', { item });
  });
  return items.map((item) => { console.log(item); });
}

function validate(input) {
  if (input = '') return false;
  if (input == 0) return false;
  return true;
}

function giantDecision(value) {
  if (value === 1) return 'one';
  if (value === 2) return 'two';
  if (value === 3) return 'three';
  if (value === 4) return 'four';
  if (value === 5) return 'five';
  if (value === 6) return 'six';
  if (value === 7) return 'seven';
  if (value === 8) return 'eight';
  if (value === 9) return 'nine';
  if (value === 10) return 'ten';
  if (value === 11) return 'eleven';
  if (value === 12) return 'twelve';
  if (value === 13) return 'thirteen';
  return 'other';
}

void validate('x');
void giantDecision(2);
void audit([]);

export function extraChecks(items) {
  const mapped = items.map((item) => { console.log(item); });
  const filtered = items.filter((item) => { console.log(item); });
  return { mapped, filtered };
}
