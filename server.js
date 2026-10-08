const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname,'data/stock.db'));
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);`);
const list = kind => db.prepare('SELECT id,data FROM records WHERE kind=? ORDER BY id DESC').all(kind).map(r=>({ ...JSON.parse(r.data),id:r.id}));
const kinds = ['products','clients','suppliers','documents','cheques','movements'];
function save(kind,data,id){if(id) db.prepare('UPDATE records SET data=? WHERE id=? AND kind=?').run(JSON.stringify(data),id,kind);else id=Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run(kind,JSON.stringify(data)).lastInsertRowid);return id;}
const server=http.createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET' && url.pathname==='/api/state'){return res.end(JSON.stringify(Object.fromEntries([...kinds.map(k=>[k,list(k)]),['settings',JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data || '{}')]])));}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw Error('Requête trop volumineuse');}const body=JSON.parse(raw||'{}');
 const kind=url.pathname.split('/')[2];if(kind==='settings'){db.prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(body));return res.end('{}');}
 if(!kinds.includes(kind))throw Error('Module inconnu');
 if(req.method==='DELETE'){
 const id=Number(url.pathname.split('/')[3]);const item=list(kind).find(x=>x.id===id);
 if(kind==='documents'&&item?.type==='Facture')throw Error('Une facture validée ne peut pas être supprimée');
 if(kind==='products'&&list('documents').some(d=>d.lines.some(l=>l.productId===id)))throw Error('Produit utilisé dans un document');
 db.prepare('DELETE FROM records WHERE id=? AND kind=?').run(id,kind);return res.end('{}');}
 if(req.method!=='POST')throw Error('Méthode non autorisée');
 if(kind==='products'){if(!body.name?.trim()||![body.price,body.stock,body.min].every(x=>Number.isFinite(x)&&x>=0))throw Error('Produit invalide');}
 if(['clients','suppliers'].includes(kind)&&!body.name?.trim())throw Error('Nom obligatoire');
 if(kind==='documents'){
 if(!['Facture','Devis'].includes(body.type)||!body.lines?.length)throw Error('Document invalide');
 db.exec('BEGIN IMMEDIATE');try{
 const quantities=new Map();body.lines=body.lines.map(l=>{const p=list('products').find(p=>p.id===l.productId);if(!p||!Number.isFinite(l.qty)||l.qty<=0)throw Error('Quantité invalide');quantities.set(p.id,(quantities.get(p.id)||0)+l.qty);return {productId:p.id,name:p.name,qty:l.qty,price:p.price};});
 if(!Number.isFinite(body.tax)||body.tax<0||body.tax>100)throw Error('TVA invalide');
 if(body.type==='Facture')for(const [id,qty] of quantities){const p=list('products').find(p=>p.id===id);if(p.stock<qty)throw Error('Stock insuffisant : '+p.name);save('products',{...p,stock:p.stock-qty},id);}
 body.clientName=list('clients').find(c=>c.id===body.clientId)?.name||'Client comptoir';body.date=new Date().toISOString();body.number=(body.type==='Facture'?'FAC':'DEV')+'-'+String(list('documents').length+1).padStart(5,'0');body.total=body.lines.reduce((s,l)=>s+l.qty*l.price,0)*(1+body.tax/100);const id=save(kind,body);db.exec('COMMIT');return res.end(JSON.stringify({id}));
 }catch(e){db.exec('ROLLBACK');throw e;}}
 if(kind==='movements'){
 const p=list('products').find(p=>p.id===body.productId);if(!p||!Number.isFinite(body.qty)||body.qty<=0)throw Error('Entrée invalide');
 db.exec('BEGIN');try{save('products',{...p,stock:p.stock+body.qty},p.id);save(kind,{...body,name:p.name,date:new Date().toISOString()});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return res.end('{}');}
 if(kind==='cheques'&&(!body.beneficiary?.trim()||!Number.isFinite(body.amount)||body.amount<=0))throw Error('Chèque invalide');
 return res.end(JSON.stringify({id:save(kind,body,body.id)}));
 }
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','app.js','style.css'].includes(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'public',file)));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
server.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',()=>console.log('GestStock démarré'));
