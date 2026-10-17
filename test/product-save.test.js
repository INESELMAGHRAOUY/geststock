const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('product save returns updated article and audit without a full state reload, retaining stock conflict checks',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-save-'));
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'3197',ALLOW_LOCAL_NO_AUTH:'1',DB_PATH:path.join(dir,'stock.db')}});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited: '+code)));});
  const save=async body=>{const r=await fetch('http://127.0.0.1:3197/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  let response=await save({name:'Body',color:'Noir',size:'M',price:20,purchasePrice:5,stock:4,min:1});
  assert.equal(response.status,200);const id=response.body.id;assert.equal(response.body.product.id,id);assert.equal(response.body.product.stock,4);assert.equal(response.body.product.name,'Body / Noir / M');
  response=await save({id,name:'Body',color:'Rouge',size:'M',price:25,purchasePrice:8,stock:4,min:1,expectedStock:4});
  assert.equal(response.status,200);assert.equal(response.body.product.name,'Body / Rouge / M');assert.equal(response.body.product.lastPurchasePrice,8);assert.equal(response.body.recordAudit.recordId,id);assert.equal(response.body.recordAudit.after.price,25);assert.equal(response.body.recordAudit.before.price,20);
  response=await save({id,name:'Body',price:30,stock:4,min:1,expectedStock:3});assert.notEqual(response.status,200);assert.match(response.body.error,/stock a changé/);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
