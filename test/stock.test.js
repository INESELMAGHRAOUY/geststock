const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const {stockBreakdown,initializeStock}=require('../stock');
test('stock derives from opening balance, active receipts and invoices; migration preserves existing balance',()=>{
 const receipts=[{productId:1,qty:4},{productId:1,qty:8,active:false}];const documents=[{type:'Facture',lines:[{productId:1,qty:2}]},{type:'Devis',lines:[{productId:1,qty:3}]},{type:'Facture',active:false,lines:[{productId:1,qty:9}]}];
 let p=stockBreakdown({id:1,stock:999,initialStock:5},receipts,documents);assert.equal(p.stock,7);assert.equal(p.purchased,4);assert.equal(p.sold,2);documents[0].lines[0].qty=3;assert.equal(stockBreakdown(p,receipts,documents).stock,6);documents[0].active=false;assert.equal(stockBreakdown(p,receipts,documents).stock,9);
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY,kind TEXT,data TEXT)');const insert=db.prepare('INSERT INTO records(kind,data) VALUES(?,?)');insert.run('products',JSON.stringify({stock:7}));insert.run('movements',JSON.stringify(receipts[0]));insert.run('documents',JSON.stringify({type:'Facture',lines:[{productId:1,qty:2}]}));initializeStock(db);let saved=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='products'").get().data);assert.equal(saved.initialStock,5);initializeStock(db);assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE kind='products'").get().data).initialStock,5);db.close();
});
test('Jumia purchase cost follows latest received purchase with discount, ignoring pending/disabled buys',()=>{
 const {latestPurchaseCost}=require('../stock');const p={id:1,purchasePrice:5};
 const receipts=[{id:2,date:'2026-10-01',status:'received',lines:[{productId:1,qty:2,unitPrice:100,discount:10}]},{id:3,date:'2026-10-03',status:'pending',lines:[{productId:1,qty:1,unitPrice:999}]},{id:4,date:'2026-10-02',status:'received',active:false,lines:[{productId:1,qty:1,unitPrice:999}]}];
 assert.equal(latestPurchaseCost(p,receipts).lastPurchasePrice,90);assert.equal(latestPurchaseCost(p,receipts).purchaseSourceId,2);assert.equal(latestPurchaseCost(p,[]).lastPurchasePrice,5);
});
test('indexed catalogue stocks match individual calculations including multi-product and inactive operations',()=>{
 const {catalogueStock}=require('../stock');
 const products=[{id:1,initialStock:10,purchasePrice:5},{id:2,stock:20,purchasePrice:7},{id:3,initialStock:0}];
 const movements=[{id:1,date:'2026-01-01',lines:[{productId:1,qty:4,unitPrice:10},{productId:2,qty:3,unitPrice:20},{productId:1,qty:2,unitPrice:12}]},{id:2,active:false,productId:1,qty:40},{id:3,status:'pending',productId:2,qty:50}];
 const documents=[{type:'Facture',lines:[{productId:1,qty:2},{productId:2,qty:1}]},{type:'Devis',lines:[{productId:1,qty:50}]}];
 const inventories=[{productId:1,delta:-1},{productId:2,delta:3,active:false}];
 const orders=[{active:true,status:'Livré',lines:[{productId:1,qty:2,fromStock:true,dispatched:true},{productId:2,qty:1,fromStock:true,dispatched:true}]}];
 const delegates=[{source:'company',status:'received',lines:[{productId:2,qty:3},{productId:1,qty:1}]},{source:'company',status:'pending',lines:[{productId:1,qty:50}]}];
 assert.deepEqual(catalogueStock(products,movements,documents,inventories,orders,delegates),products.map(p=>stockBreakdown(p,movements,documents,inventories,orders,delegates)));
});
