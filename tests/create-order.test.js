/* Tests for netlify/functions/create-order.js
 * Run: node tests/create-order.test.js
 * No database needed — Supabase is stubbed so we can assert on exactly what the
 * function sends, and on how it behaves when Postgres refuses an order.
 */
process.env.SUPABASE_URL='https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY='service-key-never-leaves-here';
let lastBody=null, nextResponse={ok:true,text:async()=>JSON.stringify({reference:'KP-1059',subtotal_cents:485000,items:1})};
/* The function now also reads the order back and records whether anybody was
   told about it, so the create_order call has to be captured by name rather
   than by being the most recent one. */
global.fetch=async(u,i)=>{
 const url=String(u), body=(i&&i.body)?JSON.parse(i.body):null;
 if(url.includes('/rpc/create_order')){lastBody=body;return nextResponse}
 if(url.includes('/rest/v1/orders?reference=')) return {ok:true,json:async()=>[]};
 return {ok:true,text:async()=>''};
};
const {handler}=require('../netlify/functions/create-order.js');
const call=(body,method='POST',ip='1.1.1.1')=>handler({httpMethod:method,body:JSON.stringify(body),headers:{'x-nf-client-connection-ip':ip}});
const good={customer_name:'Dale Whitaker',customer_email:'dale@example.com',destination:'ffl',
  ffl:{licence:'1-XX-XXX-XX-XX-00412',business_name:'Cedar Creek Arms',state:'MT'},
  lines:[{sku:'rifle-cm',qty:1,price:1}]};
const pg=msg=>({ok:false,text:async()=>JSON.stringify({message:msg})});

(async()=>{
 const t=[];
 const r=async(label,res,want)=>{const j=JSON.parse(res.body||'{}');
   t.push([label,res.statusCode,(j.error||j.reference||'').slice(0,58),res.statusCode===want?'ok':'FAIL']);};

 await r('GET rejected',            await call(good,'GET'), 405);
 await r('no name',                 await call({...good,customer_name:''}), 400);
 await r('bad email',               await call({...good,customer_email:'nope'}), 400);
 await r('empty cart',              await call({...good,lines:[]}), 400);
 await r('honeypot filled',         await call({...good,company:'spam ltd'},'POST','9.9.9.9'), 200);

 nextResponse=pg('NOT_PERMITTED:6.5 Creedmoor — 140 gr match:CA');
 await r('ammo blocked to CA',      await call(good,'POST','2.2.2.2'), 400);
 nextResponse=pg('NEEDS_DEALER:KLOVR Complete Rifle — 6.5 Creedmoor');
 await r('rifle needs a dealer',    await call(good,'POST','3.3.3.3'), 400);
 nextResponse=pg('OUT_OF_STOCK:Spare bolt assembly');
 await r('out of stock',            await call(good,'POST','4.4.4.4'), 400);
 nextResponse=pg('relation "x" does not exist');
 await r('internal fault hidden',   await call(good,'POST','5.5.5.5'), 500);

 nextResponse={ok:true,text:async()=>JSON.stringify({reference:'KP-1059',subtotal_cents:485000,items:1})};
 await r('valid order',             await call(good,'POST','6.6.6.6'), 200);
 console.log('\nprice sent by client was ignored:',
   !JSON.stringify(lastBody).includes('"price"'), '| server receives:',
   JSON.stringify(lastBody.payload.lines));

 /* The order is committed before anybody is emailed, so a notification that
    cannot be sent must not change what the customer is told. */
 nextResponse={ok:true,text:async()=>JSON.stringify({reference:'KP-1061',subtotal_cents:485000,items:1})};
 await r('notification failure is not the order\'s problem', await call(good,'POST','8.8.8.8'), 200);

 let last; for(let i=0;i<8;i++) last=await call(good,'POST','7.7.7.7');
 await r('rate limited after 6',    last, 429);

 console.log();
 for(const [l,s,m,v] of t) console.log(`  ${v==='ok'?'✓':'✗'} ${l.padEnd(24)} ${String(s).padEnd(4)} ${m}`);
 console.log('\n'+(t.every(x=>x[3]==='ok')?'all passed':'FAILURES PRESENT'));
 process.exitCode = t.every(x=>x[3]==='ok') ? 0 : 1;
})();
