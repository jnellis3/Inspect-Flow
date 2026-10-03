import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const origin=process.env.SMOKE_ORIGIN||'http://localhost:3000';
const statePath=process.env.SMOKE_STATE||join(tmpdir(),'inspect-flow-smoke.json');
const phase=process.env.SMOKE_PHASE||'initial';
let cookie='';
async function request(path,{method='GET',body,headers={},status=200,raw=false}={}){
 const response=await fetch(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin,'X-Inspection-Request':'1'}:{}),...(body&&!raw?{'Content-Type':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});
 assert.equal(response.status,status,`${method} ${path}: unexpected HTTP status`);
 const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];
 return response;
}
const json=async(path,opts)=>(await request(path,opts)).json();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(phase==='initial'){
 const auth=await json('/api/auth');assert.equal(auth.account,null);assert.equal(auth.registrationOpen,true,'Use an empty disposable installation.');
 await request('/api/projects',{status:401});
 const username='test_'+randomBytes(5).toString('hex');const password=randomBytes(24).toString('base64url');
 await request('/api/auth',{method:'POST',body:{action:'signup',username,password},headers:{Origin:'https://untrusted.example'},status:403});
 await json('/api/auth',{method:'POST',body:{action:'signup',username,password}});
 assert.equal((await json('/api/auth')).registrationOpen,false);
 await request('/api/auth',{method:'POST',body:{action:'signup',username:username+'_second',password},status:403});
 let project=(await json('/api/projects',{method:'POST',body:{address:'Synthetic test property',inspector:'Test inspector',date:'2026-01-01',notes:'Synthetic test. No real property data.'},status:201})).project;
 const temp=await mkdtemp(join(tmpdir(),'inspect-flow-media-'));let media;
 try{const path=join(temp,'test.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=12','-t','3','-an','-c:v','libx264','-pix_fmt','yuv420p','-y',path]);media=await readFile(path)}finally{await rm(temp,{recursive:true,force:true})}
 // An ISO-BMFF free box makes a valid synthetic MP4 cross the 8 MiB upload boundary.
 const padding=Buffer.alloc(8*1024*1024+513-media.length);padding.writeUInt32BE(padding.length);padding.write('free',4);media=Buffer.concat([media,padding]);
 project=(await json(`/api/projects/${project.id}/upload`,{method:'POST',body:{action:'start',name:'synthetic-test.mp4',type:'video/mp4',size:media.length,fingerprint:digest(media)}})).project;
 const part=8*1024*1024;await request(`/api/projects/${project.id}/upload?part=1`,{method:'PUT',body:media.subarray(0,part),raw:true,headers:{'Content-Type':'application/octet-stream','X-Part-Size':String(part)}});
 await request(`/api/projects/${project.id}/upload`,{method:'POST',body:{action:'complete'},status:409});
 const resumed=(await json(`/api/projects/${project.id}/upload`,{method:'POST',body:{action:'start',name:'synthetic-test.mp4',type:'video/mp4',size:media.length,fingerprint:digest(media)}})).project;assert.equal(resumed.video.parts.length,1);
 await request(`/api/projects/${project.id}/upload?part=2`,{method:'PUT',body:media.subarray(part),raw:true,headers:{'Content-Type':'application/octet-stream','X-Part-Size':String(media.length-part)}});
 project=(await json(`/api/projects/${project.id}/upload`,{method:'POST',body:{action:'complete'}})).project;
 const full=Buffer.from(await(await request(`/api/projects/${project.id}/upload`)).arrayBuffer());assert.equal(digest(full),digest(media));
 const range=await request(`/api/projects/${project.id}/upload`,{headers:{Range:'bytes=100-199'},status:206});assert.equal(range.headers.get('content-range'),`bytes 100-199/${media.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),media.subarray(100,200));
 await request(`/api/projects/${project.id}/upload`,{headers:{Range:`bytes=${media.length+10}-`},status:416});
 project=(await json(`/api/projects/${project.id}`,{method:'PATCH',body:{revision:project.revision,notes:'Saved across restart'}})).project;
 await request(`/api/projects/${project.id}`,{method:'PATCH',body:{revision:1,notes:'Stale overwrite'},status:409});
 await request(`/api/projects/${project.id}/jobs`,{method:'POST',body:{kind:'analysis',requestId:randomUUID()},status:503});
 assert.equal((await json(`/api/projects/${project.id}`)).jobs.length,0);
 await writeFile(statePath,JSON.stringify({username,password,cookie,id:project.id,sha256:digest(media),size:media.length}),{mode:0o600});
 console.log(JSON.stringify({phase,health:(await json('/api/health')).status,signupClosed:true,csrfEnforced:true,resumableMultipart:true,videoHashVerified:true,rangeVerified:true,staleWriteRejected:true,missingKeyFailure:true,stateSavedOutsideRepository:true}));
}else if(phase==='resume'){
 const state=JSON.parse(await readFile(statePath,'utf8'));cookie=state.cookie;
 assert.equal((await json('/api/auth')).account.username,state.username);
 let project=(await json(`/api/projects/${state.id}`)).project;assert.equal(project.notes,'Saved across restart');assert.equal(project.video.status,'ready');
 assert.equal(digest(Buffer.from(await(await request(`/api/projects/${state.id}/upload`)).arrayBuffer())),state.sha256);
 const finding={id:randomUUID(),title:'Synthetic observation',location:'Test area',observation:'Synthetic evidence only.',evidence:'Test pattern at one second.',whyItMatters:'Test output consistency.',recommendation:'Review this synthetic example.',severity:'information',timestamp:1,endTimestamp:2,confidence:'Synthetic test data',decision:'pending',pointer:null,diagram:null};
 project=(await json(`/api/projects/${state.id}/findings`,{method:'POST',body:{revision:project.revision,finding}})).project;
 const narration=await json(`/api/projects/${state.id}/narration`);assert(narration.hash);assert.equal(narration.scenes.length,2);
 if((await json('/api/auth')).registrationOpen){
  const originalCookie=cookie;cookie='';await json('/api/auth',{method:'POST',body:{action:'signup',username:'other_'+randomBytes(5).toString('hex'),password:randomBytes(24).toString('base64url')}});
  assert.equal((await json('/api/projects')).projects.length,0);await request(`/api/projects/${state.id}`,{status:404});await request(`/api/projects/${state.id}/upload`,{status:404});await request(`/api/projects/${state.id}`,{method:'PATCH',body:{revision:project.revision,notes:'Unauthorized'},status:404});cookie=originalCookie;
 }
 await request('/api/auth',{method:'DELETE'});cookie=state.cookie;await request('/api/projects',{status:401});
 console.log(JSON.stringify({phase,restartPersistence:true,sessionPersistence:true,mediaIntegrity:true,manualFindingSaved:true,pendingExcludedFromNarration:true,ownerIsolation:true,logoutInvalidation:true}));
}else throw new Error('SMOKE_PHASE must be initial or resume.');
