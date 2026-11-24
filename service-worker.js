const CACHE_PREFIX='moriken-safety-patrol-';
const CACHE=CACHE_PREFIX+'v0.3.10-r1';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./app-info.json','./version.json','./excel-export.js','./templates/safety-patrol-template.xlsx','./guide-quick.png','./guide-detail.png'];
const base=self.registration.scope;
const assetURLs=new Set(ASSETS.map(path=>new URL(path,base).href));
// All package-owned images in this and previous releases. Do not include user photos.
const imagePaths=new Set(ASSETS.filter(path=>/\.(?:png|jpe?g|webp|svg|gif|ico|avif|bmp)$/i.test(path)).map(path=>new URL(path,base).pathname));
const legacyImagePaths=['./icon.svg','./guide-quick.png','./guide-detail.png'];
for(const path of legacyImagePaths)imagePaths.add(new URL(path,base).pathname);
function isAppImage(request){const url=new URL(request.url);return url.origin===self.location.origin&&imagePaths.has(url.pathname);}
function isReleaseCache(name){return /^moriken-safety-patrol-v\d+\.\d+\.\d+(?:-r\d+)?$/.test(name);}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Fetch every asset from the network before modifying the new release cache.
    // An incomplete download must leave the running release and its images intact.
    const downloaded=await Promise.all(ASSETS.map(async path=>{
      const request=new Request(new URL(path,base).href,{cache:'reload'});
      const response=await fetch(request);
      if(!response.ok)throw new Error('Precache failed: '+path);
      // Avoid treating an error page or HTML fallback as a valid image.
      if(isAppImage(request)&&!/^image\//i.test(response.headers.get('content-type')||''))throw new Error('Invalid image response: '+path);
      return [request,response];
    }));
    const cache=await caches.open(CACHE);
    await Promise.all(downloaded.map(([request,response])=>cache.put(request,response)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    // New release is already cached. Only package-owned old image entries are removed.
    // Query-string variants of these image URLs are also removed.
    // Never delete a whole cache, localStorage, IndexedDB, or another app's entries.
    for(const name of await caches.keys()){
      if(!isReleaseCache(name)||name===CACHE)continue;
      const cache=await caches.open(name);
      for(const request of await cache.keys())if(isAppImage(request))await cache.delete(request);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.href.startsWith(base))return;
  const key=new URL(url.href);key.search='';key.hash='';
  if(!assetURLs.has(key.href)&&request.mode!=='navigate')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const navigation=request.mode==='navigate';
    const metadata=key.pathname.endsWith('/version.json')||key.pathname.endsWith('/app-info.json');
    const fallback=async()=>{
      const hit=await cache.match(key.href);
      if(hit)return hit;
      if(navigation)return await cache.match(new URL('index.html',base).href)||Response.error();
      return Response.error();
    };
    if(navigation||metadata){
      try{const res=await fetch(request,{cache:'no-store'});if(res.ok)return res;}
      catch{}return fallback();
    }
    // Only the active release cache is used, never a global caches.match().
    const hit=await cache.match(key.href);
    if(hit)return hit;
    try{
      const res=await fetch(request,{cache:'no-store'});
      if(res.ok&&(!isAppImage(request)||/^image\//i.test(res.headers.get('content-type')||'')))await cache.put(key.href,res.clone());
      return res;
    }catch{return Response.error();}
  })());
});
