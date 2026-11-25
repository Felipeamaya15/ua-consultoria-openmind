const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.DASHBOARD_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_S9_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'openmind-s9-carousel-'));
(async()=>{
 fs.mkdirSync(output,{recursive:true});const video=path.join(output,'synthetic.webm');
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{HeroCarousel}from './src/features/storefront/components/HeroCarousel';
 const template=location.pathname.slice(1)||'editorial';const landing={imagenes_carrusel:[{id:'photo',orden:0,tipo:'imagen',archivo:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360"%3E%3Crect width="640" height="360" fill="tan"/%3E%3C/svg%3E',texto_alternativo:'Fotografía QA'},{id:'video',orden:1,tipo:'video',archivo:'/clip.webm',texto_alternativo:'Video QA'}]};
 createRoot(document.getElementById('root')).render(<div data-storefront-visual className={'template-'+template} style={{height:400,'--openmind-carousel-mode':'automatic','--openmind-carousel-interval':'2','--openmind-carousel-transition':'slide','--openmind-carousel-indicators':'1'}}><HeroCarousel landing={landing}/></div>);`;
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},jsx:'automatic',bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'}});
 const css=fs.readFileSync(path.join(root,'src/features/storefront/components/hero-carousel.css'),'utf8');
 const server=http.createServer((req,res)=>{
 if(req.url==='/clip.webm'){res.setHeader('Content-Type','video/webm');return res.end(fs.readFileSync(video));}
 res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:`<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({headless:true,channel:'msedge'});
 const generator=await browser.newPage();
 const videoBytes=await generator.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d');context.fillRect(0,0,64,64);const stream=canvas.captureStream(8);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];recorder.ondataavailable=event=>chunks.push(event.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();for(let i=0;i<32;i++){context.fillStyle='rgb('+(40+i*4)+',100,140)';context.fillRect(0,0,64,64);await new Promise(resolve=>setTimeout(resolve,125));}recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));});
 fs.writeFileSync(video,Buffer.from(videoBytes));await generator.close();
 for(const template of ['editorial','minimal','visual','catalog'])for(const reduced of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/${template}`);
 const first=page.getByRole('button',{name:'Mostrar fotografía 1 de 2',exact:true}),second=page.getByRole('button',{name:'Mostrar fotografía 2 de 2',exact:true});
 await first.waitFor();await page.waitForTimeout(2300);
 if(reduced){assert.equal(await first.getAttribute('aria-current'),'true');assert.equal(await page.locator('.hero-carousel__image').evaluate(e=>getComputedStyle(e).animationName),'none');await second.click();}
 else await page.waitForFunction(()=>document.querySelector('video'));
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
 assert.equal(await page.locator('video').evaluate(e=>e.videoWidth),64);
 if(reduced)assert.equal(await page.locator('video').evaluate(e=>e.paused),true);
 await page.screenshot({path:path.join(output,`${template}-${reduced?'reduce':'normal'}.png`),animations:'disabled'});
 assert.deepEqual(errors,[]);console.log(`PASS ${template}: imagen, video decodificado, movimiento ${reduced?'reducido sin avance automático':'normal con avance automático'}`);await page.close();
 }console.log('OUTPUT '+output);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
