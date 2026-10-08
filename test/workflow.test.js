const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
test('devis, facture, stock insuffisant, réception et persistance',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'geststock-'));let child;
 const start=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'3099',HOST:'127.0.0.1',ALLOW_LOCAL_NO_AUTH:'1',DB_PATH:path.join(dir,'test.db')}});child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('Serveur arrêté '+code));});});
 const request=async(k,body)=>{const r=await fetch('http://127.0.0.1:3099/api/'+k,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{await start();assert.equal((await fetch('http://127.0.0.1:3099/')).status,200);const p=(await request('products',{name:'Article',price:100,stock:5,min:2})).data.id;const c=(await request('clients',{name:'Client test'})).data.id;
 const doc={type:'Devis',clientId:c,tax:20,lines:[{productId:p,qty:2}]};assert.equal((await request('documents',doc)).status,200);assert.equal((await request('state')).data.products[0].stock,5);
 assert.equal((await request('documents',{...doc,type:'Facture'})).status,200);let s=(await request('state')).data;assert.equal(s.products[0].stock,3);assert.equal(s.documents[0].total,240);
 assert.equal((await request('documents',{...doc,type:'Facture',lines:[{productId:p,qty:2},{productId:p,qty:2}]})).status,400);s=(await request('state')).data;assert.equal(s.products[0].stock,3);assert.equal(s.documents.length,2);
 assert.equal((await request('movements',{productId:p,qty:4,reference:'REC-1'})).status,200);assert.equal((await request('state')).data.products[0].stock,7);
 assert.equal((await request('cheques',{beneficiary:'Fournisseur',amount:120,words:'Cent vingt dirhams'})).status,200);
 await new Promise(resolve=>{child.once('exit',resolve);child.kill();});await start();assert.equal((await request('state')).data.products[0].stock,7);
 }finally{if(child&&!child.killed)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
