import fs from 'fs';

const path = process.argv[2];
const buf = fs.readFileSync(path);
const s = buf.toString('latin1');
const matches = [...s.matchAll(/\(([^()\\]{2,})\)/g)].map((m) => m[1]);
const unique = [...new Set(matches)].filter((t) => /[A-Za-zÀ-ÿ]/.test(t));
console.log(unique.join('\n'));