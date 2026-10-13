import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createReadingShareService,createReadingShareNodeHandler,MAX_ARCHIVE_BYTES,SHARE_QUOTA_BYTES,SHARE_BASE_URL} from '../server/reading-share-service.mjs';

const ID='a'.repeat(32),VERSION='b'.repeat(32),NEXT='c'.repeat(32),KEY='fictional-publisher-key-for-isolated-unit-tests';
const CLOCK=Date.parse('2026-10-13T12:00:00Z'),path=(id=ID,version=VERSION)=>`reading-shares/${id}/${version}.zip`,manifestPath=(id=ID)=>`reading-shares/${id}/manifest.json`;
function fixture(){
 const rows=new Map(),calls=[],state={uploadOptions:null},env={BLOB_READ_WRITE_TOKEN:'isolated-fake-storage-token',PKOS_PUBLISH_KEY_SHA256:createHash('sha256').update(KEY).digest('hex')};
 const add=(pathname,body='PK-test-archive',overrides={})=>{const data=Buffer.from(body);rows.set(pathname,{pathname,data,size:data.length,contentType:pathname.endsWith('.json')?'application/json':'application/zip',uploadedAt:new Date(CLOCK),...overrides});};
 const missing=()=>Object.assign(new Error('upstream private secret must not leak'),{name:'BlobNotFoundError'});
 const blob={
  async get(key,options){calls.push({op:'get',key,options});const row=rows.get(key);return row?{statusCode:200,blob:row,stream:new Blob([row.data]).stream()}:null;},
  async head(key){calls.push({op:'head',key});const row=rows.get(key);if(!row)throw missing();return row;},
  async put(key,body,options){calls.push({op:'put',key,options});add(key,body,{contentType:options.contentType});return rows.get(key);},
  async del(keys){calls.push({op:'del',keys});for(const key of Array.isArray(keys)?keys:[keys])rows.delete(key);},
  async list({prefix,limit,cursor}){calls.push({op:'list',prefix});const found=[...rows.values()].filter(row=>row.pathname.startsWith(prefix)).sort((a,b)=>a.pathname.localeCompare(b.pathname)),start=Number(cursor||0);return {blobs:found.slice(start,start+limit),hasMore:start+limit<found.length,cursor:String(start+limit)};}
 };
 const handleUpload=async options=>{
  if(options.body.type==='blob.generate-client-token'){const payload=options.body.payload;state.uploadOptions=await options.onBeforeGenerateToken(payload.pathname,payload.clientPayload,payload.multipart);return {type:options.body.type,clientToken:'isolated-scoped-client-token'};}
  if(options.request.headers.get('x-vercel-signature')!=='isolated-valid-signature')throw Error('upstream callback signature detail');
  await options.onUploadCompleted(options.body.payload);return {type:options.body.type,response:'ok'};
 };
 const service=createReadingShareService({blob,handleUpload,env,now:()=>CLOCK});
 const request=(query='',{method='GET',authorized=false,body,headers={}}={})=>{
  const h=new Headers(headers);if(authorized)h.set('Authorization','Bearer '+KEY);if(body!==undefined)h.set('Content-Type','application/json');
  return service(new Request(SHARE_BASE_URL+'/api/reading-shares'+query,{method,headers:h,...(body!==undefined?{body:JSON.stringify(body)}:{})}));
 };
 const publish=(overrides={})=>request('?op=publish',{method:'POST',authorized:true,body:{id:ID,version:VERSION,title:'가상 공유 기록',...overrides}});
 const seedManifest=(id=ID,version=VERSION,overrides={})=>{const row=rows.get(path(id,version));add(manifestPath(id),JSON.stringify({schema:1,id,version,path:path(id,version),title:'가상 공유 기록',size:row?.size||14,updatedAt:new Date(CLOCK).toISOString(),...overrides}));};
 return {rows,calls,state,env,add,blob,service,request,publish,seedManifest};
}

test('owner status requires configured storage and a matching bearer key',async()=>{
 const f=fixture();assert.equal((await f.request('?op=status')).status,401);
 assert.equal((await f.request('?op=status',{headers:{Authorization:'Bearer '+'wrong'.repeat(10)}})).status,401);
 const ok=await f.request('?op=status',{authorized:true});assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{configured:true,maxArchiveBytes:MAX_ARCHIVE_BYTES,quotaBytes:SHARE_QUOTA_BYTES});
 f.env.PKOS_PUBLISH_KEY_SHA256='';assert.equal((await f.request('?op=status',{authorized:true})).status,503);
 assert.equal(f.calls.length,0);
});

test('exact production origins receive CORS; lookalikes and null origin are rejected',async()=>{
 const f=fixture();for(const origin of [SHARE_BASE_URL,'https://legoschool.github.io']){const r=await f.request('',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('access-control-allow-headers'),/Authorization/);}
 for(const origin of ['https://pkos-library.vercel.app.evil.invalid','https://legoschool.github.io/','http://pkos-library.vercel.app','null'])assert.equal((await f.request('',{method:'OPTIONS',headers:{Origin:origin}})).status,403);
 assert.equal(f.calls.length,0);
});

test('all public responses are no-store and do not disclose upstream errors',async()=>{
 const f=fixture();f.blob.get=async()=>{throw Error('PRIVATE-UPSTREAM-TOKEN');};
 const r=await f.request('?id='+ID);assert.equal(r.status,502);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vercel-cdn-cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.ok(!(await r.text()).includes('PRIVATE-UPSTREAM-TOKEN'));
});

test('publish checks existing private ZIP then exposes only public metadata',async()=>{
 const f=fixture();f.add(path());const r=await f.publish();assert.equal(r.status,200);
 const published=await r.json();assert.deepEqual(Object.keys(published).sort(),['id','size','title','updatedAt','url']);assert.equal(published.url,SHARE_BASE_URL+'/share.html?id='+ID);
 const publicRead=await f.request('?id='+ID);assert.deepEqual(await publicRead.json(),published);
 assert.ok(f.calls.filter(x=>x.op==='get').every(x=>x.options.useCache===false&&x.options.access==='private'));
 const put=f.calls.find(x=>x.op==='put');assert.equal(put.options.access,'private');assert.equal(put.options.allowOverwrite,true);assert.equal(put.options.addRandomSuffix,false);
});

test('public archive is streamed as a ZIP attachment and never HTML',async()=>{
 const f=fixture();const binary=Buffer.from([80,75,3,4,0,255,128]);f.add(path(),binary);f.seedManifest();
 const r=await f.request('?id='+ID+'&op=archive');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),binary);
 f.rows.delete(manifestPath());assert.equal((await f.request('?id='+ID+'&op=archive')).status,404);
});

test('invalid IDs, versions, titles and missing uploads are rejected before publication',async()=>{
 const f=fixture();f.add(path());
 for(const id of ['../secret',ID.toUpperCase(),ID+'/../',null])assert.equal((await f.publish({id})).status,400);
 for(const version of ['../secret',null,undefined,''])assert.equal((await f.publish({version})).status,400);
 for(const title of ['',null,'a'.repeat(201),'bad\nname'])assert.equal((await f.publish({title})).status,400);
 assert.equal((await f.publish({version:NEXT})).status,404);assert.equal(f.rows.has(manifestPath()),false);
 for(const query of ['?id=../secret','?id='+ID+'&op=html'])assert.equal((await f.request(query)).status,400);
});

test('ZIP MIME, archive bound and total storage quota are enforced on the server',async()=>{
 for(const override of [{contentType:'text/html'},{size:MAX_ARCHIVE_BYTES+1},{size:0}]){const f=fixture();f.add(path(),'zip',override);assert.equal((await f.publish()).status,400);}
 const f=fixture();f.add(path());f.add('reading-shares/quota-fixture.bin','x',{size:SHARE_QUOTA_BYTES});assert.equal((await f.publish()).status,409);assert.equal(f.rows.has(manifestPath()),false);
});

test('replacement publishes the new manifest before removing the previous archive',async()=>{
 const f=fixture();f.add(path());f.seedManifest();f.add(path(ID,NEXT),'new archive');
 const r=await f.publish({version:NEXT,title:'가상 공유 기록 새 판'});assert.equal(r.status,200);assert.equal(f.rows.has(path()),false);assert.equal(f.rows.has(path(ID,NEXT)),true);
 const put=f.calls.findIndex(x=>x.op==='put'),del=f.calls.findIndex(x=>x.op==='del');assert.ok(put>=0&&del>put);
 assert.equal(JSON.parse(f.rows.get(manifestPath()).data).version,NEXT);
});

test('failed manifest write keeps the original publication and archive intact',async()=>{
 const f=fixture();f.add(path());f.seedManifest();f.add(path(ID,NEXT));f.blob.put=async()=>{throw Error('write failed');};
 assert.equal((await f.publish({version:NEXT})).status,502);assert.equal(JSON.parse(f.rows.get(manifestPath()).data).version,VERSION);assert.equal(f.rows.has(path()),true);assert.equal(f.calls.some(x=>x.op==='del'),false);
});

test('delete authenticates, revokes the manifest first and removes only its own prefix',async()=>{
 const f=fixture(),other='d'.repeat(32);f.add(path());f.seedManifest();f.add(path(ID,NEXT));f.add(path(other));
 assert.equal((await f.request('?id='+ID,{method:'DELETE'})).status,401);
 assert.equal((await f.request('?op=delete&id='+ID,{method:'DELETE',authorized:true})).status,200);
 assert.equal(f.calls.find(x=>x.op==='del').keys,manifestPath());assert.equal(f.rows.size,1);assert.equal(f.rows.has(path(other)),true);assert.equal((await f.request('?id='+ID)).status,404);
});

test('Node req/res adapter parses JSON control requests and streams a 7MB archive',async()=>{
 const f=fixture(),bytes=Buffer.alloc(7*1024*1024,0x50);f.add(path(),bytes);
 const server=createServer(createReadingShareNodeHandler(f.service));server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port+'/api/reading-shares';
 try{
  const published=await fetch(base+'?op=publish',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+KEY},body:JSON.stringify({id:ID,version:VERSION,title:'가상 대용량 공유'})});assert.equal(published.status,200);assert.equal((await published.json()).size,bytes.length);
  const archive=await fetch(base+'?id='+ID+'&op=archive');assert.equal(archive.status,200);assert.equal(archive.headers.get('transfer-encoding'),'chunked');assert.equal(archive.headers.get('cache-control'),'private, no-store');const received=Buffer.from(await archive.arrayBuffer());assert.equal(received.length,bytes.length);assert.deepEqual(createHash('sha256').update(received).digest(),createHash('sha256').update(bytes).digest());
  const denied=await fetch(base+'?op=delete&id='+ID,{method:'DELETE'});assert.equal(denied.status,401);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('discard cannot remove the published version and can remove an incomplete upload',async()=>{
 const f=fixture();f.add(path());f.seedManifest();f.add(path(ID,NEXT));
 assert.equal((await f.request('?op=discard&id='+ID+'&version='+VERSION,{method:'POST',authorized:true})).status,409);
 assert.equal((await f.request('?op=discard&id='+ID+'&version='+NEXT,{method:'POST',authorized:true})).status,200);assert.equal(f.rows.has(path()),true);assert.equal(f.rows.has(path(ID,NEXT)),false);
});

test('SDK token issuance validates owner, exact path, payload and scoped upload limits',async()=>{
 const f=fixture();const body={type:'blob.generate-client-token',payload:{pathname:path(),clientPayload:JSON.stringify({id:ID,version:VERSION}),multipart:true}};
 assert.equal((await f.request('?op=upload',{method:'POST',body})).status,401);
 const r=await f.request('?op=upload',{method:'POST',authorized:true,body});assert.equal(r.status,200);const options=f.state.uploadOptions;assert.deepEqual(options.allowedContentTypes,['application/zip']);assert.equal(options.maximumSizeInBytes,MAX_ARCHIVE_BYTES);assert.equal(options.validUntil,CLOCK+600000);assert.equal(options.allowOverwrite,false);assert.equal(options.addRandomSuffix,false);assert.deepEqual(JSON.parse(options.tokenPayload),{id:ID,version:VERSION});assert.ok(!JSON.stringify(options).includes(KEY));
 for(const payload of [{...body.payload,pathname:'unrelated/file.zip'},{...body.payload,clientPayload:'bad json'},{...body.payload,clientPayload:JSON.stringify({id:ID})}])assert.equal((await f.request('?op=upload',{method:'POST',authorized:true,body:{...body,payload}})).status,400);
});

test('upload callback is SDK-verified and never publishes data or requires an owner key',async()=>{
 const f=fixture();f.add(path());const body={type:'blob.upload-completed',payload:{blob:{pathname:path()},tokenPayload:JSON.stringify({id:ID,version:VERSION})}};
 assert.ok((await f.request('?op=upload',{method:'POST',body})).status>=400);
 assert.equal((await f.request('?op=upload',{method:'POST',body,headers:{'x-vercel-signature':'isolated-valid-signature'}})).status,200);assert.equal(f.rows.has(manifestPath()),false);assert.equal(f.calls.some(x=>x.op==='put'),false);
});

test('authenticated lists paginate and clean only old unpublished archives',async()=>{
 const f=fixture();for(let i=1;i<=21;i++){const id=i.toString(16).padStart(32,'0');f.add(path(id));f.seedManifest(id);}
 f.add(path(ID,NEXT),'old unpublished',{uploadedAt:new Date(CLOCK-2*86400000)});f.add(path(ID),'recent unpublished');
 assert.equal((await f.request('?op=list')).status,401);const first=await(await f.request('?op=list',{authorized:true})).json();assert.equal(first.shares.length,20);assert.equal(first.cursor,'20');const second=await(await f.request('?op=list&cursor='+first.cursor,{authorized:true})).json();assert.equal(second.shares.length,1);assert.equal(second.cursor,null);assert.equal(f.rows.has(path(ID,NEXT)),false);assert.equal(f.rows.has(path(ID)),true);
 assert.equal((await f.request('?op=list&cursor=-1',{authorized:true})).status,400);
});

test('oversized request JSON and malformed stored manifests fail without disclosure',async()=>{
 const f=fixture();assert.equal((await f.publish({title:'x'.repeat(70000)})).status,413);
 f.add(manifestPath(),JSON.stringify({schema:1,id:ID,version:VERSION,path:'private/another-file',title:'bad',size:1,updatedAt:new Date(CLOCK).toISOString()}));
 assert.equal((await f.request('?id='+ID)).status,502);assert.equal((await f.request('?id='+ID+'&op=archive')).status,502);
});
