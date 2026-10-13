import * as blob from '@vercel/blob';
import {handleUpload} from '@vercel/blob/client';
import {createReadingShareService,createReadingShareNodeHandler} from '../server/reading-share-service.mjs';

export const config={api:{bodyParser:false}};
export const readingShareService=createReadingShareService({blob,handleUpload});

// Vercel's Node handler and local HTTP adapters can both call this entry point.
// Stream archive bytes; never buffer a complete share in a Function response.
export default createReadingShareNodeHandler(readingShareService);
