/* Local preview of the built site: node build.js && node serve.js */
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'dist');
const T={'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml',
         '.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let f=decodeURIComponent(req.url.split('?')[0]);
  let p=path.join(ROOT,f);
  if(!path.extname(p))p=path.join(p,'index.html');          // /shop -> /shop/index.html
  fs.readFile(p,(e,d)=>{
    if(e){
      // mirror Netlify: unmatched paths get 404.html with a 404 status
      return fs.readFile(path.join(ROOT,'404.html'),(e2,d2)=>{
        res.writeHead(404,{'Content-Type':T['.html']});
        res.end(e2?('404: '+f):d2);
      });
    }
    res.writeHead(200,{'Content-Type':T[path.extname(p)]||'application/octet-stream'});
    res.end(d);
  });
}).listen(8787,()=>console.log('serving dist/ on http://localhost:8787'));
