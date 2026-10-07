import {pipeline,env} from './vendor/local-ai/runtime.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/local-ai/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;
const models={embedding:'Xenova/paraphrase-multilingual-MiniLM-L12-v2',speech:'Xenova/whisper-tiny'};
const revisions={embedding:'2c4055b12046f11709e9df2c122e59ffbdc2f900',speech:'5332fcc35e32a33b86612b9a57a89be7906102b1'};
let embedder,transcriber;
self.onmessage=async({data})=>{const {id,type,payload}=data,report=message=>self.postMessage({id,progress:message});try{const progress_callback=p=>report(p.status==='progress'?'모델 다운로드 '+Math.round(p.progress||0)+'%':p.status==='ready'?'모델 준비 완료':'모델 준비 중');let result;
 if(type==='embed'){embedder??=await pipeline('feature-extraction',models.embedding,{revision:revisions.embedding,dtype:'q8',device:'wasm',progress_callback});const out=await embedder(payload.text,{pooling:'mean',normalize:true});result=Array.from(out.data);}
 else if(type==='transcribe'){transcriber??=await pipeline('automatic-speech-recognition',models.speech,{revision:revisions.speech,dtype:'q8',device:'wasm',progress_callback});report('음성을 글로 바꾸는 중');result=await transcriber(payload.audio,{language:payload.language||'korean',task:'transcribe',chunk_length_s:25,stride_length_s:5,return_timestamps:true});}
 else throw Error('알 수 없는 처리 작업');self.postMessage({id,result});
 }catch(e){self.postMessage({id,error:e.message});}};
