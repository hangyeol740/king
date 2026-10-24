import {mkdir,copyFile,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
await access(new URL('../models/strategy-v10-robust2.json',import.meta.url));
const destination=new URL('../public/socket.io/',import.meta.url);
await mkdir(destination,{recursive:true});
await copyFile(path.join(path.dirname(require.resolve('socket.io-client/package.json')),'dist/socket.io.min.js'),new URL('socket.io.js',destination));
console.log('Vercel 정적 파일·Socket.IO 클라이언트·강화학습 모델 준비 완료');
