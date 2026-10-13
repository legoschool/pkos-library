import {createHash,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export const MAX_ARCHIVE_BYTES=64*1024*1024;
export const SHARE_QUOTA_BYTES=500*1024*1024;
export const SHARE_BASE_URL='https://pkos-library.vercel.app';
const PREFIX='reading-shares/', ID=/^[a-f0-9]{32}$/, MAX_OBJECTS=1000, LIST_SIZE=20;
const ORIGINS=new Set([SHARE_BASE_URL,'https://legoschool.github.io']);
const DAY=24*60*60*1000;
class ShareError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ShareError(status,message);};
const validId=value=>typeof value==='string'&&ID.test(value);
const manifestPath=id=>PREFIX+id+'/manifest.json';
const archivePath=(id,version)=>PREFIX+id+'/'+version+'.zip';
const missing=error=>error?.name==='BlobNotFoundError'||error?.status===404||error?.statusCode===404;

async function limitedText(stream,limit){
 const reader=stream?.getReader();if(!reader)fail(502,'공유 자료를 읽지 못했습니다.');
 const chunks=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,'요청 내용이 너무 큽니다.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks.map(x=>Buffer.from(x)),size).toString('utf8');
}

// Storage and the SDK webhook verifier are injected so authorization and state
// transitions can be tested without credentials or an external Blob store.
export function createReadingShareService({blob,handleUpload,env=process.env,now=Date.now}){
 const configured=()=>/^[a-fA-F0-9]{64}$/.test(env.PKOS_PUBLISH_KEY_SHA256||'')&&!!env.BLOB_READ_WRITE_TOKEN;
 const auth=request=>{
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token||!timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(env.PKOS_PUBLISH_KEY_SHA256,'hex')))fail(401,'게시 설정을 연결한 뒤 다시 시도해 주세요.');
 };
 const identify=id=>{if(!validId(id))fail(400,'공유 주소가 올바르지 않습니다.');};
 const identifyVersion=(id,version)=>{identify(id);identify(version);};
 const readOptions={access:'private',useCache:false};
 async function getManifest(id){
  let result;try{result=await blob.get(manifestPath(id),readOptions);}catch(error){if(missing(error))return null;throw error;}
  if(!result)return null;
  if(result.statusCode!==200||result.blob?.size>8192)fail(502,'공유 정보를 읽지 못했습니다.');
  let value;try{value=JSON.parse(await limitedText(result.stream,8192));}catch(error){if(error instanceof ShareError)throw error;fail(502,'공유 정보를 읽지 못했습니다.');}
  if(value?.schema!==1||value.id!==id||!validId(value.version)||value.path!==archivePath(id,value.version)||typeof value.title!=='string'||value.title.length>200||!Number.isSafeInteger(value.size)||value.size<1||value.size>MAX_ARCHIVE_BYTES||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))fail(502,'공유 정보를 읽지 못했습니다.');
  return value;
 }
 const publicInfo=value=>({id:value.id,title:value.title,url:SHARE_BASE_URL+'/share.html?id='+value.id,updatedAt:value.updatedAt,size:value.size});
 async function scan(prefix=PREFIX){
  const rows=[];let cursor;const visited=new Set();
  do{
   const result=await blob.list({prefix,limit:1000,...(cursor?{cursor}:{})});
   if(!Array.isArray(result.blobs))fail(502,'게시 목록을 읽지 못했습니다.');
   for(const row of result.blobs){if(typeof row.pathname!=='string'||!row.pathname.startsWith(prefix)||!Number.isSafeInteger(row.size)||row.size<0)fail(502,'게시 목록을 읽지 못했습니다.');rows.push(row);}
   if(rows.length>MAX_OBJECTS||result.hasMore&&rows.length>=MAX_OBJECTS)fail(409,'공유 파일이 많습니다. 사용하지 않는 게시물을 먼저 삭제해 주세요.');
   if(!result.hasMore)break;
   cursor=result.cursor;if(typeof cursor!=='string'||!cursor||visited.has(cursor))fail(502,'게시 목록을 읽지 못했습니다.');visited.add(cursor);
  }while(cursor);
  return rows;
 }
 const totalSize=rows=>rows.reduce((sum,row)=>sum+row.size,0);
 async function headArchive(id,version){
  let result;try{result=await blob.head(archivePath(id,version));}catch(error){if(missing(error))fail(404,'업로드한 공유 파일을 찾지 못했습니다.');throw error;}
  if(!result||result.pathname!==archivePath(id,version)||!Number.isSafeInteger(result.size)||result.size<1||result.size>MAX_ARCHIVE_BYTES||result.contentType!=='application/zip')fail(400,'공유 파일의 형식이나 크기가 올바르지 않습니다.');
  return result;
 }
 async function readJson(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))fail(415,'JSON 형식으로 요청해 주세요.');
  const size=Number(request.headers.get('content-length'));if(Number.isFinite(size)&&size>65536)fail(413,'요청 내용이 너무 큽니다.');
  let value;try{value=JSON.parse(await limitedText(request.body,65536));}catch(error){if(error instanceof ShareError)throw error;fail(400,'요청 내용이 올바르지 않습니다.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'요청 내용이 올바르지 않습니다.');
  return value;
 }
 async function cleanOrphans(rows){
  let removed=0;const manifests=new Map();
  for(const row of rows){
   const match=/^reading-shares\/([a-f0-9]{32})\/([a-f0-9]{32})\.zip$/.exec(row.pathname);
   if(!match||removed>=20||!Number.isFinite(new Date(row.uploadedAt).getTime())||now()-new Date(row.uploadedAt).getTime()<DAY)continue;
   const id=match[1];if(!manifests.has(id))manifests.set(id,await getManifest(id));
   if(manifests.get(id)?.path===row.pathname)continue;
   await blob.del(row.pathname);removed++;
  }
 }
 return async function readingShares(request){
  const origin=request.headers.get('origin'),headers=new Headers({'Cache-Control':'private, no-store','Vercel-CDN-Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Vary':'Origin'});
  const json=(value,status=200)=>{const h=new Headers(headers);h.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(value),{status,headers:h});};
  try{
   if(origin&&!ORIGINS.has(origin))fail(403,'이 주소에서는 게시 기능을 사용할 수 없습니다.');
   if(origin)headers.set('Access-Control-Allow-Origin',origin);
   if(request.method==='OPTIONS'){headers.set('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');return new Response(null,{status:204,headers});}
   if(!configured())fail(503,'웹 공유 서비스를 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.');
   const url=new URL(request.url),op=url.searchParams.get('op')||'',id=url.searchParams.get('id');
   if(request.method==='GET'){
    if(op==='status'){auth(request);return json({configured:true,maxArchiveBytes:MAX_ARCHIVE_BYTES,quotaBytes:SHARE_QUOTA_BYTES});}
    if(op==='list'){
     auth(request);const cursor=url.searchParams.get('cursor')||'0';if(!/^(0|[1-9]\d{0,3})$/.test(cursor)||Number(cursor)>MAX_OBJECTS)fail(400,'목록 위치가 올바르지 않습니다.');
     const rows=await scan();if(cursor==='0')await cleanOrphans(rows);
     const ids=rows.filter(row=>/^reading-shares\/[a-f0-9]{32}\/manifest\.json$/.test(row.pathname)).map(row=>row.pathname.split('/')[1]).sort();
     const start=Number(cursor),shares=[];
     for(const key of ids.slice(start,start+LIST_SIZE)){const manifest=await getManifest(key);if(manifest)shares.push(publicInfo(manifest));}
     return json({shares,cursor:start+LIST_SIZE<ids.length?String(start+LIST_SIZE):null});
    }
    if(op&&op!=='archive')fail(400,'지원하지 않는 공유 요청입니다.');
    identify(id);const manifest=await getManifest(id);if(!manifest)fail(404,'게시가 취소되었거나 공유 주소를 찾을 수 없습니다.');
    if(op!=='archive')return json(publicInfo(manifest));
    let result;try{result=await blob.get(manifest.path,readOptions);}catch(error){if(missing(error))fail(404,'공유 파일을 찾을 수 없습니다.');throw error;}
    if(!result||result.statusCode!==200||result.blob?.size!==manifest.size)fail(404,'공유 파일을 찾을 수 없습니다.');
    headers.set('Content-Type','application/zip');headers.set('Content-Disposition','attachment; filename="shared-records.zip"');
    return new Response(result.stream,{headers});
   }
   if(request.method==='POST'&&op==='upload'){
    const body=await readJson(request);
    if(!['blob.generate-client-token','blob.upload-completed'].includes(body.type))fail(400,'업로드 요청이 올바르지 않습니다.');
    const result=await handleUpload({body,request,token:env.BLOB_READ_WRITE_TOKEN,
     onBeforeGenerateToken:async(pathname,clientPayload)=>{
      auth(request);let payload;try{payload=JSON.parse(clientPayload);}catch{fail(400,'업로드 정보가 올바르지 않습니다.');}
      identifyVersion(payload?.id,payload?.version);if(pathname!==archivePath(payload.id,payload.version))fail(400,'업로드 위치가 올바르지 않습니다.');
      const rows=await scan(),remaining=SHARE_QUOTA_BYTES-totalSize(rows)-8192;if(remaining<1)fail(409,'공유 저장 공간이 가득 찼습니다. 사용하지 않는 게시물을 삭제해 주세요.');
      return {allowedContentTypes:['application/zip'],maximumSizeInBytes:Math.min(MAX_ARCHIVE_BYTES,remaining),validUntil:now()+10*60*1000,addRandomSuffix:false,allowOverwrite:false,tokenPayload:JSON.stringify({id:payload.id,version:payload.version}),callbackUrl:SHARE_BASE_URL+'/api/reading-shares?op=upload'};
     },
     // Only the SDK-verified callback reaches here. Publication is a separate,
     // owner-authenticated action; an upload completion never publishes data.
     onUploadCompleted:async()=>{}
    });
    return json(result);
   }
   if(request.method==='POST'&&op==='publish'){
    auth(request);const body=await readJson(request);identifyVersion(body.id,body.version);
    const title=typeof body.title==='string'?body.title.trim():'';if(!title||title.length>200||/[\u0000-\u001f\u007f]/.test(title))fail(400,'공유 제목을 1자부터 200자까지 입력해 주세요.');
    const archive=await headArchive(body.id,body.version),prior=await getManifest(body.id),rows=await scan();
    const manifest={schema:1,id:body.id,version:body.version,path:archivePath(body.id,body.version),title,size:archive.size,updatedAt:new Date(now()).toISOString()};
    const encoded=JSON.stringify(manifest),oldManifest=rows.find(row=>row.pathname===manifestPath(body.id)),unlistedArchive=rows.some(row=>row.pathname===manifest.path)?0:archive.size;
    if(totalSize(rows)+unlistedArchive+Buffer.byteLength(encoded)-(oldManifest?.size||0)>SHARE_QUOTA_BYTES)fail(409,'공유 저장 공간이 가득 찼습니다. 사용하지 않는 게시물을 삭제해 주세요.');
    await blob.put(manifestPath(body.id),encoded,{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
    if(prior&&prior.path!==manifest.path){try{await blob.del(prior.path);}catch{/* A later authenticated list cleans an abandoned version. */}}
    return json(publicInfo(manifest));
   }
   if(request.method==='POST'&&op==='discard'){
    auth(request);const version=url.searchParams.get('version');identifyVersion(id,version);const manifest=await getManifest(id);
    if(manifest?.version===version)fail(409,'현재 게시 중인 파일은 정리할 수 없습니다. 게시 취소를 이용해 주세요.');
    await blob.del(archivePath(id,version));return json({discarded:true});
   }
   if(request.method==='DELETE'&&(!op||op==='delete')){
    auth(request);identify(id);
    // Revoke the public lookup before deleting any archive data.
    await blob.del(manifestPath(id));const rows=await scan(PREFIX+id+'/');
    for(let i=0;i<rows.length;i+=50)await blob.del(rows.slice(i,i+50).map(row=>row.pathname));
    return json({deleted:true});
   }
   fail(405,'지원하지 않는 공유 요청입니다.');
  }catch(error){return json({error:error instanceof ShareError?error.message:'공유 서비스를 이용하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'},error instanceof ShareError?error.status:502);}
 };
}

// Streams both the incoming control request and the outgoing archive. Exposed
// separately to test the same Node req/res adapter that Vercel executes.
export function createReadingShareNodeHandler(service){
 return async function handler(req,res){
  try{
   const headers=new Headers();for(const [key,value]of Object.entries(req.headers||{})){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);}
   const method=req.method||'GET',options={method,headers};
   if(!['GET','HEAD'].includes(method)){options.body=Readable.toWeb(req);options.duplex='half';}
   const response=await service(new Request(new URL(req.url||'/',SHARE_BASE_URL),options));
   res.statusCode=response.status;for(const [key,value]of response.headers)res.setHeader(key,value);
   if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
  }catch{
   if(res.headersSent){res.destroy();return;}
   res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(JSON.stringify({error:'공유 서비스를 이용하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'}));
  }
 };
}
