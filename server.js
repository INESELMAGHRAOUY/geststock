const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');
const crypto = require('node:crypto');
const username = process.env.ADMIN_USER;
const password = process.env.ADMIN_PASSWORD;
const localOnly = process.env.ALLOW_LOCAL_NO_AUTH === '1' && (!process.env.HOST || process.env.HOST === '127.0.0.1');
if (!localOnly && (!username || !password || password.length < 16)) {
 console.error('Configurer ADMIN_USER et ADMIN_PASSWORD (16 caractères minimum).');
 process.exit(1);
}
const digest = value => crypto.createHash('sha256').update(value).digest();
const expected = digest(`${username}:${password}`);
const failures = new Map();
fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
const databasePath = path.resolve(process.env.DB_PATH || path.join(__dirname,'data/stock.db'));
const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);`);
const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(databasePath), 'backups');
let backingUp = false;
async function dailyBackup() {
 if (backingUp) return;
 backingUp = true;
 try {
 fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 const day = new Date().toISOString().slice(0,10);
 const target = path.join(backupDir,`stock-${day}.db`);
 if (!fs.existsSync(target)) {
 const temporary = target + '.tmp';
 await backup(db, temporary);
 fs.chmodSync(temporary,0o600);
 fs.renameSync(temporary,target);
 }
 const files = fs.readdirSync(backupDir).filter(f=>/^stock-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse();
 for (const file of files.slice(30)) fs.unlinkSync(path.join(backupDir,file));
 } catch (error) { console.error('Sauvegarde échouée :',error.message); }
 finally { backingUp = false; }
}
dailyBackup();
setInterval(dailyBackup,60*60*1000).unref();
const list = kind => db.prepare('SELECT id,data FROM records WHERE kind=? ORDER BY id DESC').all(kind).map(r=>({ ...JSON.parse(r.data),id:r.id}));
const kinds = ['products','clients','suppliers','documents','cheques','movements'];
function save(kind,data,id){if(id) db.prepare('UPDATE records SET data=? WHERE id=? AND kind=?').run(JSON.stringify(data),id,kind);else id=Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run(kind,JSON.stringify(data)).lastInsertRowid);return id;}
const server=http.createServer(async(req,res)=>{
 try {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','same-origin');
 if (!localOnly) {
 const address = req.socket.remoteAddress;
 const now = Date.now();
 for (const [key,value] of failures) if(now-value.start>60000) failures.delete(key);
 if ((failures.get(address)?.count || 0)>=20) {res.writeHead(429,{'Retry-After':'60'});return res.end('Trop de tentatives. Réessayez dans une minute.');}
 const header=req.headers.authorization||'';
 const supplied=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString():'';
 if (!crypto.timingSafeEqual(digest(supplied),expected)) {
 if(header) {const entry=failures.get(address)||{start:now,count:0};entry.count++;failures.set(address,entry);}
 res.writeHead(401,{'WWW-Authenticate':'Basic realm="GestStock", charset="UTF-8"'});return res.end('Connexion requise');
 }
 }
 if (!['GET','HEAD'].includes(req.method) && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host))) {
 res.writeHead(403);return res.end('Origine non autorisée');
 }
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
