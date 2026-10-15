import {createRequire} from 'node:module';import {homedir} from 'node:os';import path from 'node:path';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PKOS_PLAYWRIGHT_PATH||path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
export const {chromium}=playwright;export const launchBrowser=()=>chromium.launch({...(process.env.PKOS_BROWSER_PATH?{executablePath:process.env.PKOS_BROWSER_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),headless:true});

export async function stubGoogle(ctx,{thumbs='ok'}={}){
 await ctx.route(/^https:\/\/([\w-]+\.)*(google\.com|googleusercontent\.com|youtube-nocookie\.com|ytimg\.com)\//,r=>{const u=r.request().url();
  if(u.includes('/thumbnail')&&thumbs==='missing')return r.fulfill({status:404,body:''});
  if(u.includes('/thumbnail'))return r.fulfill({status:200,contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAAAAACw=','base64')});
  if(u.includes('ytimg'))return r.fulfill({status:200,contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAAAAACw=','base64')});
  return r.fulfill({status:200,contentType:'text/html',body:'<html><body>preview</body></html>'});});
}
