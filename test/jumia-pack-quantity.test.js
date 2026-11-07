const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {handleJumia}=require('../jumia'),{setupRecordAudit}=require('../record-admin');
const {stockBreakdown}=require('../stock'),{jumiaOrderTotals,jumiaStockLines}=require('../public/jumia-math');
const {delegateConsumption}=require('../delegate-stock');
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY,kind TEXT,data TEXT)');setupRecordAudit(db);
 const raw=k=>db.prepare('SELECT id,data FROM records WHERE kind=?').all(k).map(r=>({...JSON.parse(r.data),id:r.id}));
 const list=k=>k==='products'?raw(k).map(p=>stockBreakdown(p,[],[],[],raw('jumiaOrders'))):raw(k);
 const save=(k,v,id)=>{if(id){db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(v),id);return id;}return Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run(k,JSON.stringify(v)).lastInsertRowid);};
 const run=(kind,body)=>handleJumia({db,kind,body,user:{role:'admin',name:'Admin'},list,save});
 const productId=save('products',{name:'Shampoo',price:397,purchasePrice:40,initialStock:7});
 const storeId=run('jumiaStores',{name:'Packs',listings:[{productId,sku:'PACK2',unitsPerPack:2},{productId,sku:'SINGLE'}]}).id;
 const store=()=>list('jumiaStores')[0],order=id=>list('jumiaOrders').find(o=>o.id===id);
 const create=(number,qty=1,status='Prêt à expédier')=>run('jumiaOrders',{storeId,number,date:'2026-11-07',lines:[{productId,listingId:store().listings[0].id,name:'Shampoo',qty,salePrice:397,status}],costs:{}}).id;
 return {run,list,save,store,order,create,productId};
}
test('pack size persists, validates whole positive units, and defaults to one',t=>{
 const f=fixture(t);assert.deepEqual(f.store().listings.map(l=>l.unitsPerPack),[2,1]);
 for(const value of [0,-1,1.5,'2',Number.MAX_SAFE_INTEGER+1]){const s=f.store();assert.throws(()=>f.run('jumiaStores',{...s,expectedRecord:JSON.stringify(s),reason:'Bad pack',listings:s.listings.map(l=>({...l,unitsPerPack:value}))}),/Quantité par pack/);}
});
test('two packs of three consume six units, keep pack sale and shipping, and restore six on failed delivery',t=>{
 const f=fixture(t),s=f.store();f.run('jumiaStores',{...s,expectedRecord:JSON.stringify(s),reason:'Pack 3',listings:s.listings.map(l=>({...l,unitsPerPack:3}))});
 const id=f.create('TRIPLE',2);let o=f.order(id);assert.equal(o.lines[0].unitsPerPack,3);assert.equal(f.list('products')[0].stock,7);
 f.run('jumiaOrders',{id,expectedRecord:JSON.stringify(o),action:'ship'});o=f.order(id);assert.equal(f.list('products')[0].stock,1);assert.deepEqual(jumiaStockLines(o),[[f.productId,-6]]);
 assert.throws(()=>{const other=f.create('TOO-MANY');f.run('jumiaOrders',{id:other,expectedRecord:JSON.stringify(f.order(other)),action:'ship'});},/Stock insuffisant/);
 f.run('jumiaOrders',{id,expectedRecord:JSON.stringify(o),action:'delivery',results:[{lineId:o.lines[0].lineId,status:'Livré'}]});o=f.order(id);
 const totals=jumiaOrderTotals(o);assert.equal(totals.revenue,79400);assert.equal(totals.productCost,24000);assert.equal(totals.marketplaceFees,1200);
 assert.equal(delegateConsumption({...o,stockOwnerId:4})[0][1],6);
 const before=f.store();f.run('jumiaStores',{...before,expectedRecord:JSON.stringify(before),reason:'Future packs of 2',listings:before.listings.map(l=>({...l,unitsPerPack:2}))});
 o=f.order(id);f.run('jumiaOrders',{...o,expectedRecord:JSON.stringify(o),reason:'Refresh',lines:o.lines.map(l=>({...l,unitsPerPack:99}))});o=f.order(id);assert.equal(o.lines[0].unitsPerPack,3);assert.equal(f.list('products')[0].stock,1);assert.equal(jumiaOrderTotals(o).productCost,24000);
 f.run('jumiaOrders',{...o,expectedRecord:JSON.stringify(o),reason:'Failed delivery',lines:o.lines.map(l=>({...l,status:'La livraison a échoué'}))});assert.equal(f.list('products')[0].stock,7);
 const newer=f.create('NEW');assert.equal(f.order(newer).lines[0].unitsPerPack,2);
});
test('historical single-unit orders remain unchanged when a listing becomes a pack',t=>{
 const f=fixture(t),id=f.create('LEGACY');let o=f.order(id);delete o.lines[0].unitsPerPack;o.lines[0].status='Livré';o.lines[0].dispatched=true;f.save('jumiaOrders',o,id);
 assert.equal(f.list('products')[0].stock,6);
 f.run('jumiaOrders',{...o,expectedRecord:JSON.stringify(f.order(id)),reason:'Legacy refresh'});assert.equal(f.order(id).lines[0].unitsPerPack,1);assert.equal(f.list('products')[0].stock,6);
 assert.equal(jumiaOrderTotals(f.order(id)).productCost,4000);
});
test('Jumia listing title survives product linking and later listing edits',t=>{
 const f=fixture(t);let s=f.store();const title='Jumia shampoo pack de 2 — titre original';
 f.run('jumiaStores',{...s,expectedRecord:JSON.stringify(s),reason:'Jumia title',listings:s.listings.map(l=>({...l,name:title}))});s=f.store();assert.equal(s.listings[0].name,title);
 const listings=s.listings.map(l=>{const copy={...l,shippingFee:9};delete copy.name;return copy;});
 f.run('jumiaStores',{...s,expectedRecord:JSON.stringify(s),reason:'Shipping only',listings});assert.equal(f.store().listings[0].name,title);assert.equal(f.list('products')[0].name,'Shampoo');
});
