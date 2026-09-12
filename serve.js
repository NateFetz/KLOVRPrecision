const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/Users/nfetzer/Desktop/KLOVRPrecision/site';
const TYPES={'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml','.css':'text/css','.js':'text/javascript'};
http.createServer((req,res)=>{
  let f=decodeURIComponent(req.url.split('?')[0]);
  if(f==='/')f='/index.html';
  const p=path.join(ROOT,f);
  fs.readFile(p,(e,d)=>{
    if(e){res.writeHead(404);return res.end('not found: '+f);}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'application/octet-stream'});
    res.end(d);
  });
}).listen(8787,()=>console.log('serving '+ROOT+' on 8787'));
