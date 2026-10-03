import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbiddenPath=/(^|\/)(?:\.env(?:\..*)?|secrets|data|backups|\.openai|\.wrangler|\.sites-runtime|outputs|work)(?:\/|$)|\.(?:sqlite(?:-wal|-shm)?|db|pem|key|mp4|mov|webm|mp3|pdf)$/i;
const patterns=[
 ['private deployment URL',/https?:\/\/[^\s"'<>]+\.chatgpt\.site\b/i],
 ['private deployment identifier',/appg(?:prj|dep|ver)_[a-z0-9]{12,}/i],
 ['local home path',/\/(?:home|Users)\/[a-zA-Z][^\s/"']*\//],
 ['OpenAI credential',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/],
 ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['AWS credential',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['credential URL',/https?:\/\/[^\s/:]+:[^\s/@]+@/],
];
const failures=[];
// Published marketing assets are intentionally public.
const publicMedia=/^public\/marketing\/[^/]+\.(?:mp4|jpg|png|webp)$/;
for(const path of files){
 if(path!=='.env.example'&&!publicMedia.test(path)&&forbiddenPath.test(path))failures.push(`${path}: runtime/private file must not be tracked`);
 const bytes=readFileSync(path);if(bytes.includes(0))continue;
 const text=bytes.toString('utf8');for(const [label,pattern] of patterns)if(pattern.test(text))failures.push(`${path}: ${label}`);
}
let commits=[];try{commits=execFileSync('git',['rev-list','--all'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').filter(Boolean)}catch{}
for(const commit of commits){
 const emails=execFileSync('git',['show','-s','--format=%ae%n%ce',commit],{encoding:'utf8'}).trim().split('\n');
 if(emails.some(email=>!email.endsWith('@users.noreply.github.com')))failures.push(`${commit.slice(0,12)}: use a GitHub noreply commit email`);
 const paths=execFileSync('git',['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const path of paths){
  if(path!=='.env.example'&&!publicMedia.test(path)&&forbiddenPath.test(path))failures.push(`${commit.slice(0,12)}:${path}: private file in history`);
  const bytes=execFileSync('git',['show',`${commit}:${path}`],{maxBuffer:8*1024*1024});if(bytes.includes(0))continue;
  for(const [label,pattern]of patterns)if(pattern.test(bytes.toString('utf8')))failures.push(`${commit.slice(0,12)}:${path}: ${label}`);
 }
}
if(failures.length){console.error([...new Set(failures)].join('\n'));process.exit(1)}
console.log(`Privacy pattern audit passed: ${files.length} files and ${commits.length} commits. This supplements manual review; it cannot prove the absence of all sensitive data.`);
