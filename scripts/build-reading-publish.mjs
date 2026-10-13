import {build} from 'esbuild';
await build({stdin:{contents:"export {upload} from '@vercel/blob/client';",resolveDir:process.cwd(),loader:'js'},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:'vendor/reading-blob-client.js',legalComments:'eof'});
console.log('Built private reading upload client.');
