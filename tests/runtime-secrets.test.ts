import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runtime} from '../lib/inspection/server';

test('server reads an optional mounted secret and rejects conflicting or unreadable configuration',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'inspect-flow-config-'));
 const before={key:process.env.OPENAI_API_KEY,file:process.env.OPENAI_API_KEY_FILE};
 try{
  delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY_FILE;
  assert.equal(runtime.OPENAI_API_KEY,undefined);
  const file=join(directory,'credential');await writeFile(file,'  synthetic-test-value\n',{mode:0o600});process.env.OPENAI_API_KEY_FILE=file;
  assert.equal(runtime.OPENAI_API_KEY,'synthetic-test-value');
  process.env.OPENAI_API_KEY='synthetic-other-value';assert.throws(()=>runtime.OPENAI_API_KEY,/not both/);
  delete process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY_FILE=join(directory,'missing');assert.throws(()=>runtime.OPENAI_API_KEY,/could not be read/);
 }finally{
  if(before.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before.key;
  if(before.file===undefined)delete process.env.OPENAI_API_KEY_FILE;else process.env.OPENAI_API_KEY_FILE=before.file;
  await rm(directory,{recursive:true,force:true});
 }
});
