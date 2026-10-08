const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');
const crypto = require('node:crypto');
const username = process.env.ADMIN_USER;
const password = process.env.ADMIN_PASSWORD;
const localOnly = process.env.ALLOW_LOCAL_NO_AUTH === '1' && (!process.env.HOST || process.env.HOST === '127.0.0.1');
const scrypt = require('node:util').promisify(crypto.scrypt);
async function hashPassword(value,salt=crypto.randomBytes(16).toString('hex')) {
 return salt+':'+(await scrypt(value,salt,64)).toString('hex');
}
async function verifyPassword(value,stored) {
 const [salt,hash]=stored.split(':');
 const candidate=await scrypt(value,salt,64);
 return crypto.timingSafeEqual(candidate,Buffer.from(hash,'hex'));
}
const failures = new Map();
const sessions = new Map();
const sessionLifetime = 8*60*60*1000;
fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
const databasePath = path.resolve(process.env.DB_PATH || path.join(__dirname,'data/stock.db'));
const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')), active INTEGER NOT NULL DEFAULT 1);`);
const initialization=(async()=>{
 if(!localOnly && !db.prepare('SELECT id FROM users LIMIT 1').get()) {
 if(!username || !password || password.length<16) throw Error('Configurer ADMIN_USER et ADMIN_PASSWORD (16 caractères minimum).');
 const hash=await hashPassword(password);
 db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)').run(username.trim(),username.trim(),hash,'admin');
 }
})();
const publicUser=user=>({id:user.id,username:user.username,name:user.name,role:user.role,active:!!user.active});
function revokeUser(id){for(const [key,session] of sessions) if(session.userId===id)sessions.delete(key);}
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
initialization.then(dailyBackup).catch(()=>{});
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
 const url=new URL(req.url,'http://localhost');
 if (!['GET','HEAD'].includes(req.method) && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host))) {
 res.writeHead(403);return res.end('Origine non autorisée');
 }
 const cookieName = localOnly || process.env.HOST==='127.0.0.1' ? 'geststock_session' : '__Host-geststock_session';
 const cookieOptions = `; HttpOnly; SameSite=Strict; Path=/${cookieName.startsWith('__Host-')?'; Secure':''}`;
 const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 const now=Date.now();
 for(const [key,session] of sessions) if(session.expires<=now) sessions.delete(key);
 if(url.pathname==='/api/login' && req.method==='POST') {
 const address=req.socket.remoteAddress;
 for(const [key,value] of failures) if(now-value.start>60000) failures.delete(key);
 if((failures.get(address)?.count||0)>=20) {res.writeHead(429,{'Content-Type':'application/json','Retry-After':'60'});return res.end(JSON.stringify({error:'Trop de tentatives. Réessayez dans une minute.'}));}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Requête trop volumineuse');}
 const credentials=JSON.parse(raw||'{}');
 const user=db.prepare('SELECT * FROM users WHERE username=?').get(typeof credentials.username==='string'?credentials.username.trim():'');
 const valid=await verifyPassword(typeof credentials.password==='string'?credentials.password:'',user?.password_hash||('00000000000000000000000000000000:'+ '0'.repeat(128)));
 if(!user || !user.active || !valid) {
 const entry=failures.get(address)||{start:now,count:0};entry.count++;failures.set(address,entry);
 res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Identifiants incorrects.'}));
 }
 const session=crypto.randomBytes(32).toString('hex');sessions.set(session,{expires:now+sessionLifetime,userId:user.id});
 res.setHeader('Set-Cookie',`${cookieName}=${session}; Max-Age=${sessionLifetime/1000}${cookieOptions}`);
 res.setHeader('Content-Type','application/json');return res.end('{}');
 }
 if(url.pathname==='/api/logout' && req.method==='POST') {
 sessions.delete(token);res.setHeader('Set-Cookie',`${cookieName}=; Max-Age=0${cookieOptions}`);res.setHeader('Content-Type','application/json');return res.end('{}');
 }
 const currentUser=localOnly?{id:0,name:'Développement local',username:'local',role:'admin',active:1}:db.prepare('SELECT * FROM users WHERE id=?').get(sessions.get(token)?.userId||-1);
 if(!localOnly && !currentUser?.active) sessions.delete(token);
 if(url.pathname==='/login' && req.method==='GET') {
 if(localOnly || sessions.has(token)){res.writeHead(303,{Location:'/'});return res.end();}
 res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'public/login.html')));
 }
 const loginAsset=['/login.js','/style.css'].includes(url.pathname) && req.method==='GET';
 if(!localOnly && !sessions.has(token) && !loginAsset) {
 if(url.pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Session expirée. Veuillez vous reconnecter.'}));}
 res.writeHead(303,{Location:'/login'});return res.end();
 }
 if(url.pathname.startsWith('/api/')){
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET' && url.pathname==='/api/state'){return res.end(JSON.stringify(Object.fromEntries([...kinds.map(k=>[k,list(k)]),['currentUser',publicUser(currentUser)],['users',currentUser.role==='admin'?db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id').all().map(publicUser):[]],['settings',JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data || '{}')]])));}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)throw Error('Requête trop volumineuse');}const body=JSON.parse(raw||'{}');
 if(url.pathname==='/api/users' && req.method==='POST') {
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès réservé aux administrateurs.'}));}
 const existing=body.id?db.prepare('SELECT * FROM users WHERE id=?').get(Number(body.id)):null;
 if(body.id && !existing)throw Error('Compte introuvable');
 const userName=typeof body.username==='string'?body.username.trim():'';
 const name=typeof body.name==='string'?body.name.trim():'';
 if(!/^[a-zA-Z0-9_.@-]{3,80}$/.test(userName)||!name||name.length>100||!['admin','user'].includes(body.role)||typeof body.active!=='boolean')throw Error('Informations utilisateur invalides');
 if(!existing || body.password){if(typeof body.password!=='string'||body.password.length<16||body.password.length>256)throw Error('Mot de passe : entre 16 et 256 caractères');}
 const hash=body.password?await hashPassword(body.password):existing.password_hash;
 db.exec('BEGIN IMMEDIATE');try {
 const latest=existing?db.prepare('SELECT * FROM users WHERE id=?').get(existing.id):null;
 if(latest?.role==='admin' && latest.active && (body.role!=='admin'||!body.active) && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").get().n<=1)throw Error('Conservez au moins un administrateur actif');
 if(existing)db.prepare('UPDATE users SET username=?,name=?,password_hash=?,role=?,active=? WHERE id=?').run(userName,name,hash,body.role,Number(body.active),existing.id);
 else db.prepare('INSERT INTO users(username,name,password_hash,role,active) VALUES(?,?,?,?,?)').run(userName,name,hash,body.role,Number(body.active));
 db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');if(error.message.includes('UNIQUE'))throw Error('Ce nom de connexion existe déjà');throw error;}
 if(existing)revokeUser(existing.id);
 return res.end('{}');
 }
 const kind=url.pathname.split('/')[2];if(kind==='settings'){if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès réservé aux administrateurs.'}));}db.prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(body));return res.end('{}');}
 if(!kinds.includes(kind))throw Error('Module inconnu');
 if(req.method==='DELETE'){
 const id=Number(url.pathname.split('/')[3]);const item=list(kind).find(x=>x.id===id);
 if(kind==='documents'&&item?.type==='Facture')throw Error('Une facture validée ne peut pas être supprimée');
 if(kind==='products'&&list('documents').some(d=>d.lines.some(l=>l.productId===id)))throw Error('Produit utilisé dans un document');
 db.prepare('DELETE FROM records WHERE id=? AND kind=?').run(id,kind);return res.end('{}');}
 if(req.method!=='POST')throw Error('Méthode non autorisée');
 if(kind==='products'){if(!body.name?.trim()||![body.price,body.stock,body.min].every(x=>Number.isFinite(x)&&x>=0))throw Error('Produit invalide');}
 if(['clients','suppliers'].includes(kind)){
 if(typeof body.name!=='string'||!body.name.trim())throw Error('Nom obligatoire');
 if(body.id!==undefined&&(!Number.isSafeInteger(body.id)||!db.prepare('SELECT id FROM records WHERE id=? AND kind=?').get(body.id,kind)))throw Error('Contact introuvable');
 for(const key of ['phone','email','address','ice'])if(body[key]!==undefined&&typeof body[key]!=='string')throw Error('Informations de contact invalides');
 body.name=body.name.trim();
 }
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
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','app.js','style.css','login.js'].includes(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'public',file)));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
initialization.then(()=>server.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',()=>console.log('GestStock démarré'))).catch(error=>{console.error(error.message);process.exit(1);});
