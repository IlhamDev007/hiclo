import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'), cached=join(process.env.LOCALAPPDATA||'','ms-playwright/chromium-1254/chrome-win64/chrome.exe');
const profile=await mkdtemp(join(tmpdir(),'still-lifecycle-'));
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Original page</title><link rel="icon" href="/original.svg"><body style="margin:0;background:#f4f0e8"><h1>Joy lifecycle test</h1>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`, otherOrigin=origin.replace('127.0.0.1','localhost');
const launchOptions={executablePath:process.env.STILL_CHROMIUM||(existsSync(cached)?cached:chromium.executablePath()),headless:true,viewport:{width:1200,height:800},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-first-run']};
let context,worker,id;const errors=[];
async function launch(){context=await chromium.launchPersistentContext(profile,launchOptions);context.setDefaultTimeout(10000);context.on('weberror',e=>errors.push(e.error().message));worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');id=new URL(worker.url()).hostname;}
async function read(){return worker.evaluate(()=>chrome.storage.local.get(null));}
async function popupFor(page){
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url}))[0].id,page.url());
  const popup=await context.newPage();await popup.setViewportSize({width:418,height:600});
  await popup.addInitScript(id=>{const query=chrome.tabs.query.bind(chrome.tabs);chrome.tabs.query=opts=>opts.active?chrome.tabs.get(id).then(tab=>[tab]):query(opts);},tabId);
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);await popup.waitForFunction(()=>!document.getElementById('page-status-text').textContent.includes('Checking'));
  return popup;
}
async function select(popup,panel){await popup.locator(`[data-panel="${panel}"]`).click();}
async function apply(popup,scope){await popup.locator(`#joy-scope-${scope}`).click();await popup.waitForFunction(()=>document.getElementById('joy-message').textContent==='Joy configuration saved.');}
async function count(page,n){await page.waitForFunction(n=>(document.querySelector('#still-joy')?.shadowRoot.querySelectorAll('.charm').length||0)===n,n);}
try{
  await launch();
  const a=await context.newPage();await a.goto(origin+'/a');
  const b=await context.newPage();await b.goto(otherOrigin+'/b');
  const popup=await popupFor(a);await select(popup,'joy');
  await popup.locator('[data-joy-add="spider-man"]').click();await count(a,1);await count(b,0);
  assert.equal((await read()).joy.enabled,false);
  await popup.locator('label.power').click();await count(a,0);await count(b,0);
  assert.equal((await read()).joy.enabled,false,'Pausing a preview must not save it globally');
  await popup.locator('label.power').click();await count(a,1);
  const fresh=await context.newPage();await fresh.goto(otherOrigin+'/fresh');await count(fresh,0);
  await apply(popup,'site');assert.equal((await read()).joy.enabled,false);
  await a.reload();await count(a,1);await b.reload();await count(b,0);
  await a.bringToFront();
  await a.waitForFunction(()=>{const c=document.querySelector('#still-joy').shadowRoot.querySelector('canvas'),d=c.getContext('2d').getImageData(0,35,c.width,c.height-35).data;for(let i=0;i<d.length;i+=4)if(d[i+3]>15&&d[i]>d[i+1]*1.5&&d[i]>d[i+2]*1.2)return true;return false;});
  // Explicit eye geometry and rope join, rather than a different label on an
  // otherwise identical hook. Preview remains local until applied.
  await popup.bringToFront();await popup.locator('#joy-hanging').evaluate(el=>{el.open=true;});await popup.locator('[data-joy-design="eye"]').click();await apply(popup,'site');
  await a.bringToFront();
  await a.waitForFunction(()=>document.querySelector('#still-joy').shadowRoot.querySelector('.charm').dataset.ropeStartY==='30');
  const joinPixel=await a.evaluate(()=>{const root=document.querySelector('#still-joy').shadowRoot,pin=root.querySelector('.anchor'),x=new DOMMatrix(pin.style.transform).m41+20;return root.querySelector('canvas').getContext('2d').getImageData(Math.round(x),30,1,1).data[3];});assert.ok(joinPixel>0);

  // Configure the other components, then pause the entire extension.
  await popup.bringToFront();await select(popup,'display');await popup.locator('#brightness').fill('70');await popup.locator('#scope-all').click();
  await a.waitForFunction(()=>document.querySelector('div[aria-hidden="true"]')?.style.backdropFilter.includes('brightness(0.7)'));
  await select(popup,'privacy');await popup.locator('label[for="hideTitle"]').click();await popup.locator('label[for="hideIcon"]').click();await a.waitForFunction(()=>document.title==='Private tab');
  await popup.locator('label.power').click();
  for(const page of [a,b,fresh]){await count(page,0);await page.waitForFunction(()=>!document.querySelector('div[aria-hidden="true"]')&&document.title==='Original page');}
  await a.reload();await count(a,0);assert.equal(await a.title(),'Original page');
  const pausedTab=await context.newPage();await pausedTab.goto(origin+'/paused-new-tab');await count(pausedTab,0);
  assert.equal((await read()).settings.enabled,false);
  assert.equal((await read()).joySites['127.0.0.1'].enabled,true,'Pause must preserve saved Joy preferences');
  await popup.locator('label.power').click();await count(a,1);await a.waitForFunction(()=>document.title==='Private tab');
  await count(b,0);await pausedTab.close();

  // Pausing during pointer capture must cancel the gesture and prevent a later
  // pointerup from saving a stale position or restarting the animation loop.
  await a.bringToFront();const pin=a.locator('#still-joy .anchor'),pinBox=await pin.boundingBox();const beforeDrag=(await read()).joySites['127.0.0.1'].charms[0].x;
  await a.mouse.move(pinBox.x+20,12);await a.mouse.down();await a.mouse.move(350,90,{steps:8});
  await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,enabled:false}});});
  await count(a,0);await a.mouse.up();assert.equal((await read()).joySites['127.0.0.1'].charms[0].x,beforeDrag);
  await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,enabled:true}});});await count(a,1);

  await popup.bringToFront();await select(popup,'joy');await apply(popup,'all');await count(a,1);await count(b,1);await count(fresh,1);
  const popupB=await popupFor(b);await select(popupB,'joy');await popupB.locator('#joy-library').evaluate(el=>{el.open=true;});await popupB.locator('[data-joy-add="hammer"]').click();await count(b,2);await count(a,1);await apply(popupB,'site');
  assert.equal((await read()).joy.charms.length,1);assert.equal((await read()).joySites.localhost.charms.length,2);
  // An upload on B never appears on A and remains after unrelated resets.
  await popupB.locator('#joy-library').evaluate(el=>{el.open=true;});await popupB.locator('#joy-upload').setInputFiles(join(root,'icons/128.png'));await apply(popupB,'site');await count(b,3);await count(a,1);
  await popup.bringToFront();await popup.locator('#joy-size').fill('110');await popup.locator('#joy-size').dispatchEvent('change');await apply(popup,'site');
  assert.equal((await read()).joy.charms[0].size,90);assert.equal((await read()).joySites['127.0.0.1'].charms[0].size,110);assert.equal((await read()).joySites.localhost.charms[0].size,90);
  await popup.locator('#joy-config-remove').click();await popup.waitForFunction(()=>document.getElementById('joy-message').textContent.includes('configuration removed'));assert.equal(Object.hasOwn((await read()).joySites,'127.0.0.1'),false);await count(a,1);await count(b,3);

  // Reset each component through its actual UI and compare other components.
  for(const component of ['display','privacy','window']){
    const before=await read();await select(popup,component);assert.equal(await popup.locator('#reset-all').textContent(),`Reset ${component[0].toUpperCase()+component.slice(1)}`);await popup.locator('#reset-all').click();await popup.waitForFunction(component=>document.getElementById('toast').textContent===`Only ${component} settings were reset.`,component);
    const after=await read();for(const key of ['joy','joySites','joyImages'])assert.deepEqual(after[key],before[key]);
    const unchanged={display:['hideTitle','hideIcon','rememberSize','width','height'],privacy:['brightness','mode','intensity','rememberSize','width','height'],window:['brightness','mode','intensity','hideTitle','hideIcon']}[component];for(const key of unchanged)assert.equal(after.settings[key],before.settings[key]);
  }
  // Card labels stay centered below equal-sized SVG icons even at narrow widths.
  await popup.setViewportSize({width:320,height:540});
  const geometry=await popup.locator('nav .nav-item').evaluateAll(nodes=>nodes.map(node=>{const icon=node.querySelector('.nav-icon').getBoundingClientRect(),label=node.querySelector('.nav-label').getBoundingClientRect();return {iconTop:icon.top,labelTop:label.top,dx:Math.abs(icon.x+icon.width/2-label.x-label.width/2)};}));
  for(const item of geometry){assert.ok(item.dx<1);assert.equal(item.iconTop,geometry[0].iconTop);assert.equal(item.labelTop,geometry[0].labelTop);}
  await popup.setViewportSize({width:418,height:600});await select(popup,'joy');await popup.locator('#joy-hanging').evaluate(el=>{el.open=true;});
  await popup.locator('#joy').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  await popup.locator('#toast').evaluate(el=>el.classList.remove('visible'));
  await popup.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await mkdir(join(root,'test-results'),{recursive:true});await popup.locator('body').screenshot({path:join(root,'test-results/joy-scoped.png')});
  await a.bringToFront();await a.screenshot({path:join(root,'test-results/spider-sense.png')});

  // Persist the master pause across a browser restart. Saved Joy domains resume
  // with their separate configurations when the user enables the extension.
  await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,enabled:false}});});await count(a,0);await count(b,0);
  await context.close();await launch();
  const restoredA=await context.newPage();await restoredA.goto(origin+'/restored');const restoredB=await context.newPage();await restoredB.goto(otherOrigin+'/restored');await count(restoredA,0);await count(restoredB,0);
  const restoredPopup=await popupFor(restoredA);await restoredPopup.locator('label.power').click();await count(restoredA,1);await count(restoredB,3);
  // Joy reset leaves Display and Privacy settings (and their rendered effects)
  // intact. It also releases scoped custom image storage.
  await restoredPopup.locator('#brightness').fill('65');await restoredPopup.locator('#scope-site').click();await select(restoredPopup,'privacy');await restoredPopup.locator('label[for="hideTitle"]').click();
  await restoredA.waitForFunction(()=>document.title==='Private tab');const beforeJoyReset=await read();await select(restoredPopup,'joy');await restoredPopup.locator('#reset-all').click();
  await restoredPopup.waitForFunction(()=>document.getElementById('joy-message').textContent.includes('Joy reset'));
  await count(restoredA,0);await count(restoredB,0);const afterJoyReset=await read();assert.deepEqual(afterJoyReset.settings,beforeJoyReset.settings);assert.deepEqual(afterJoyReset.siteSettings,beforeJoyReset.siteSettings);assert.deepEqual(afterJoyReset.joySites,{});assert.deepEqual(afterJoyReset.joyImages,{});
  assert.equal(await restoredA.title(),'Private tab');assert.ok((await restoredA.locator('div[aria-hidden="true"]').getAttribute('style')).includes('brightness(0.65)'));
  assert.deepEqual(errors,[]);
  console.log('PASS: spider-sense pixels, eye-hook connection, Joy site/global isolation, scoped uploads, master pause/reload/restart/cancel, aligned cards, and independent Display/Privacy/Window/Joy resets.');
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true,maxRetries:3});}
