// Computes large knowledge maps off the main thread so the library stays responsive.
import {computeMap} from './map-compute.js';
self.onmessage=e=>{
 const {id,notes,opts,criteria,weights}=e.data;
 try{self.postMessage({id,result:computeMap(notes,opts,criteria,weights)});}
 catch(err){self.postMessage({id,error:String(err?.message||err)});}
};
