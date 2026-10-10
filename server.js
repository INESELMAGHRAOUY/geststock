const {handleCatalog}=require('./jumia-catalog-import');
const {setupBrands,handleBrands}=require('./brands');
const {handleOrderImport}=require('./jumia-order-import');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync, backup} = require('node:sqlite');
const crypto = require('node:crypto');
const {handleJumia}=require('./jumia');
const {handleSettlement}=require('./settlements');
const {purchaseLines}=require('./purchase');
const {stockBreakdown,initializeStock}=require('./stock');
const {setupRecordAudit,auditRecord,handleRecordAdmin}=require('./record-admin');
const {amountToWords}=require('./public/amount-words');
const {setupRecurring,syncRecurring}=require('./recurring');
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
setupRecurring(db);
syncRecurring(db);
setInterval(()=>{try{syncRecurring(db);}catch(e){console.error('Charges périodiques :',e.message);}},60*1000).unref();
setupBrands(db);
db.exec('CREATE TABLE IF NOT EXISTS product_images(id INTEGER PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS payment_attachments(id INTEGER PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS expense_lifecycle_history(id INTEGER PRIMARY KEY,expense_id INTEGER NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,snapshot TEXT NOT NULL)');
setupRecordAudit(db);
initializeStock(db);
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
const rawList = kind => db.prepare('SELECT id,data FROM records WHERE kind=? ORDER BY id DESC').all(kind).map(r=>({ ...JSON.parse(r.data),id:r.id}));
const list=kind=>{const records=rawList(kind);if(kind!=='products')return records;const movements=rawList('movements'),documents=rawList('documents'),inventories=rawList('inventories'),orders=rawList('jumiaOrders');return records.map(p=>stockBreakdown(p,movements,documents,inventories,orders));};
const kinds = ['products','clients','suppliers','documents','cheques','movements','expenses','expensePayments','banks','inventories','settlements','accountOpenings','jumiaStores','jumiaOrders','jumiaHubs','jumiaReports','jumiaCategories'];
function save(kind,data,id){if(id) db.prepare('UPDATE records SET data=? WHERE id=? AND kind=?').run(JSON.stringify(data),id,kind);else id=Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run(kind,JSON.stringify(data)).lastInsertRowid);return id;}
if(!db.prepare("SELECT value FROM app_metadata WHERE key='banks-defaults-v1'").get()){
 db.exec('BEGIN IMMEDIATE');try{
 for(const name of ['CDM','ATTIJARIWAFA BANK','BMCE'])save('banks',{name,account:'',rib:'',agency:'',active:true});
 db.prepare('INSERT INTO app_metadata VALUES(?,?)').run('banks-defaults-v1','1');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
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
 if(req.method==='GET'&&/^\/api\/product-images\/\d+$/.test(url.pathname)){const im=db.prepare('SELECT * FROM product_images WHERE id=?').get(Number(url.pathname.split('/')[3]));if(!im){res.writeHead(404);return res.end();}res.setHeader('Content-Type',im.mime);return res.end(Buffer.from(im.content));}
 if(req.method==='GET' && /^\/api\/attachments\/\d+$/.test(url.pathname)){
 const attachment=db.prepare('SELECT * FROM payment_attachments WHERE id=?').get(Number(url.pathname.split('/')[3]));
 if(!attachment){res.writeHead(404);return res.end('{}');}
 res.setHeader('Content-Type',attachment.mime);
 res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(attachment.name));
 return res.end(Buffer.from(attachment.content));
 }
 if(req.method==='GET' && url.pathname==='/api/state'){syncRecurring(db);return res.end(JSON.stringify(Object.fromEntries([...kinds.map(k=>[k,list(k)]),['recurringCharges',db.prepare('SELECT * FROM recurring_charges ORDER BY id').all().map(x=>({id:x.id,label:x.label,category:x.category,amount:x.amount_cents/100,active:!!x.active,startMonth:x.start_month,lastMonth:x.last_month,supplierId:x.supplier_id||null,supplierName: list('suppliers').find(s=>s.id===x.supplier_id)?.name||''}))],['expenseLifecycleHistory',currentUser.role==='admin'?db.prepare('SELECT id,expense_id AS expenseId,action,reason,actor,at,snapshot FROM expense_lifecycle_history ORDER BY id DESC').all().map(x=>({...x,snapshot:JSON.parse(x.snapshot)})):[]],['recordAudit',currentUser.role==='admin'?db.prepare('SELECT id,kind,record_id AS recordId,action,actor,at,reason,before_data,after_data FROM record_audit ORDER BY id DESC').all().map(x=>({...x,before:JSON.parse(x.before_data),after:JSON.parse(x.after_data),before_data:undefined,after_data:undefined})):[]],['currentUser',publicUser(currentUser)],['users',currentUser.role==='admin'?db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id').all().map(publicUser):[]],['settings',JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data || '{}')]])));}
 if(req.method==='GET'&&url.pathname==='/api/jumiaBrands'){const q=(url.searchParams.get('q')||'').trim(),requested=Number(url.searchParams.get('offset')||0),offset=Number.isSafeInteger(requested)&&requested>=0?requested:0;const total=db.prepare('SELECT COUNT(*) AS n FROM jumia_brands').get().n;let rows=[],matched=0;if(!q){matched=total;rows=db.prepare('SELECT * FROM jumia_brands ORDER BY name,id LIMIT 50 OFFSET ?').all(offset);}else if(q.length>=3){const pattern='%'+q.replace(/[\\%_]/g,'')+'%';matched=db.prepare('SELECT COUNT(*) AS n FROM jumia_brands WHERE name LIKE ? OR code=?').get(pattern,q).n;rows=db.prepare('SELECT * FROM jumia_brands WHERE name LIKE ? OR code=? ORDER BY name,id LIMIT 50 OFFSET ?').all(pattern,q,offset);}return res.end(JSON.stringify({rows,total,matched,offset}));}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(['/api/jumiaBrands','/api/jumiaCatalogImports'].includes(url.pathname)?17000000:url.pathname==='/api/expensePayments'?7500000:['/api/products','/api/jumiaCategories'].includes(url.pathname)?4500000:['/api/jumiaReports','/api/jumiaOrderImports'].includes(url.pathname)?4500000:1000000))throw Error('Requête trop volumineuse');}const body=JSON.parse(raw||'{}');let productImage=null;
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
 if(url.pathname==='/api/recurringCharges' && req.method==='POST'){
 syncRecurring(db);
 if(typeof body.label!=='string'||!body.label.trim()||typeof body.category!=='string'||!body.category.trim()||typeof body.active!=='boolean'||!Number.isFinite(body.amount)||body.amount<=0||!Number.isSafeInteger(Math.round(body.amount*100))||Math.abs(body.amount*100-Math.round(body.amount*100))>0.00001)throw Error('Charge périodique invalide');
 if(typeof body.startMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.startMonth)||body.startMonth<'2020-01'||body.startMonth>'2100-12')throw Error('Mois de début invalide');
 const existing=body.id?db.prepare('SELECT * FROM recurring_charges WHERE id=?').get(body.id):null;
 if(body.id&&!existing)throw Error('Charge périodique introuvable');
 if(!existing&&body.startMonth<new Date().toISOString().slice(0,7))throw Error('Choisissez le mois actuel ou un mois futur');
 const supplier=body.supplierId?list('suppliers').find(x=>x.id===body.supplierId):null;
 if(body.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 if(existing)db.prepare('UPDATE recurring_charges SET label=?,category=?,amount_cents=?,active=?,start_month=?,supplier_id=? WHERE id=?').run(body.label.trim(),body.category.trim(),Math.round(body.amount*100),Number(body.active),body.startMonth,supplier?.id||null,body.id);
 else db.prepare('INSERT INTO recurring_charges(label,category,amount_cents,active,start_month,supplier_id) VALUES(?,?,?,?,?,?)').run(body.label.trim(),body.category.trim(),Math.round(body.amount*100),Number(body.active),body.startMonth,supplier?.id||null);
 syncRecurring(db);return res.end('{}');
 }
 const kind=url.pathname.split('/')[2];if(kind==='settings'){if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès réservé aux administrateurs.'}));}db.prepare('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(body));return res.end('{}');}
 if(kind==='jumiaOrderImports'){if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleOrderImport({db,body,user:currentUser,list,save})));}
 if(kind==='jumiaBrands'){if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleBrands(db,body,currentUser)));}
 if(kind==='jumiaCatalogImports'){if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleCatalog({db,body,user:currentUser,list,save})));}
 if(!kinds.includes(kind)&&kind!=='adminRecords')throw Error('Module inconnu');
 if(['jumiaStores','jumiaOrders','jumiaHubs','jumiaReports','jumiaCategories'].includes(kind)){if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleJumia({db,body,user:currentUser,list,save,kind})));}
 if(kind==='accountOpenings'){
 if(req.method!=='POST'||currentUser.role!=='admin')throw Error('Gestion de trésorerie réservée aux administrateurs');
 if(!Number.isSafeInteger(body.bankId)||body.bankId<0||(body.bankId&&!list('banks').some(b=>b.id===body.bankId)))throw Error('Compte invalide');
 if(!Number.isFinite(body.amount)||!Number.isSafeInteger(Math.round(body.amount*100))||Math.abs(body.amount*100-Math.round(body.amount*100))>0.00001||typeof body.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||Number.isNaN(Date.parse(body.date))||new Date(body.date).toISOString().slice(0,10)!==body.date||body.date>new Date().toISOString().slice(0,10)||!body.reason?.trim())throw Error('Solde, date et motif obligatoires');
 const old=list(kind).find(o=>o.bankId===body.bankId);if(old&&JSON.stringify(old)!==body.expectedRecord)throw Error('Le solde initial a changé. Rechargez');
 const updated={bankId:body.bankId,amountCents:Math.round(body.amount*100),date:body.date,reason:body.reason.trim(),updatedBy:currentUser.name,updatedAt:new Date().toISOString()};
 db.exec('BEGIN IMMEDIATE');try{const id=save(kind,updated,old?.id);if(old)auditRecord(db,kind,old,{...updated,id},currentUser,'Modification','Solde initial : '+body.reason.trim());db.exec('COMMIT');return res.end(JSON.stringify({id}));}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(kind==='settlements'){if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleSettlement({db,list,save,user:currentUser,body})));}
 if(kind==='adminRecords'){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès administrateur requis'}));}
 if(req.method!=='POST')throw Error('Méthode invalide');return res.end(JSON.stringify(handleRecordAdmin({db,body,user:currentUser,list,save})));
 }
 if(kind==='expenses' && body.action==='setActive'){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Désactivation réservée aux administrateurs.'}));}
 if(!Number.isSafeInteger(body.id)||typeof body.active!=='boolean'||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw Error('Charge, état et motif obligatoires');
 db.exec('BEGIN IMMEDIATE');try{
 const expense=list('expenses').find(x=>x.id===body.id);if(!expense)throw Error('Charge introuvable');
 if(body.expectedActive!==(expense.active!==false))throw Error('L’état de la charge a changé. Rechargez la page.');
 if(body.active===(expense.active!==false))throw Error('La charge possède déjà cet état');
 const at=new Date().toISOString();
 const updated={...expense,active:body.active,stateChangedAt:at,stateChangedBy:currentUser.name};save('expenses',updated,expense.id);auditRecord(db,'expenses',expense,updated,currentUser,body.active?'Réactivation':'Désactivation',body.reason.trim());
 db.prepare('INSERT INTO expense_lifecycle_history(expense_id,action,reason,actor,at,snapshot) VALUES(?,?,?,?,?,?)').run(expense.id,body.active?'Réactivation':'Désactivation',body.reason.trim(),currentUser.name,at,JSON.stringify(expense));
 db.exec('COMMIT');return res.end('{}');
 }catch(error){db.exec('ROLLBACK');throw error;}
 }
 if(kind==='banks'){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès réservé aux administrateurs.'}));}
 if(req.method!=='POST')throw Error('Désactivez la banque pour conserver son historique');
 if(typeof body.name!=='string'||!body.name.trim()||typeof body.active!=='boolean')throw Error('Nom et état de la banque obligatoires');
 if(body.id!==undefined&&(!Number.isSafeInteger(body.id)||!list('banks').some(b=>b.id===body.id)))throw Error('Banque introuvable');
 for(const key of ['account','rib','agency'])if(body[key]!==undefined&&typeof body[key]!=='string')throw Error('Informations bancaires invalides');
 const old=list('banks').find(x=>x.id===body.id);const updated={name:body.name.trim(),account:body.account||'',rib:body.rib||'',agency:body.agency||'',active:body.active};const id=save('banks',updated,body.id);if(old)auditRecord(db,'banks',old,{...updated,id},currentUser,old.active!==body.active?(body.active?'Réactivation':'Désactivation'):'Modification','Gestion bancaire');return res.end(JSON.stringify({id}));
 }
 if(kind==='expensePayments' && body.id!==undefined){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Modification et validation réservées aux administrateurs.'}));}
 const existing=Number.isSafeInteger(body.id)?list(kind).find(x=>x.id===body.id):null;
 if(!existing)throw Error('Paiement introuvable');
 if(body.expectedUpdatedAt!==(existing.updatedAt||existing.createdAt))throw Error('Le paiement a changé. Rechargez la page.');
 if(existing.active===false&&body.action!=='attachment')throw Error('Réactivez le paiement avant sa modification');
 if(body.action!=='attachment'&&list('expenses').find(x=>x.id===existing.expenseId)?.active===false)throw Error('Réactivez la charge avant de modifier ou valider son paiement');
 if(body.action==='validate'){
 if(existing.method!=='Chèque'||existing.status==='validated')throw Error('Ce chèque ne peut pas être validé');
 const value=body.clearedDate;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>new Date().toISOString().slice(0,10))throw Error('Date d’encaissement invalide');
 const updated={...existing,status:'validated',clearedDate:value,validatedBy:currentUser.name,updatedAt:new Date().toISOString(),updatedBy:currentUser.name};
 updated.history=[...(existing.history||[]),{action:'Encaissement validé',by:currentUser.name,at:updated.updatedAt,previous:{...existing,history:undefined}}];
 save(kind,updated,existing.id);return res.end('{}');
 }
 if(body.action==='attachment')Object.assign(body,{...existing,attachment:body.attachment,action:'attachment',expectedUpdatedAt:body.expectedUpdatedAt});
 }
 if(['expenses','expensePayments'].includes(kind)) {
 if(req.method!=='POST')throw Error('Les charges et paiements sont conservés dans l’historique');
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const cents=value=>{if(!Number.isFinite(value)||value<=0||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>0.00001)throw Error('Montant positif avec deux décimales maximum');return Math.round(value*100);};
 const amountCents=cents(body.amount);
 if(!validDate(body.date))throw Error('Date invalide');
 if(kind==='expenses') {
 if(typeof body.label!=='string'||!body.label.trim()||typeof body.category!=='string'||!body.category.trim())throw Error('Libellé et catégorie obligatoires');
 if(body.id!==undefined){if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès administrateur requis'}));}return res.end(JSON.stringify(handleRecordAdmin({db,body:{...body,kind:'expenses',action:'modify',data:body},user:currentUser,list,save})));}
 const supplier=body.supplierId?list('suppliers').find(x=>x.id===body.supplierId):null;
 if(body.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 const id=save(kind,{label:body.label.trim(),category:body.category.trim(),amount:amountCents/100,amountCents,date:body.date,supplierId:supplier?.id||null,supplierName:supplier?.name||'',reference:String(body.reference||''),notes:String(body.notes||''),createdBy:currentUser.name,createdAt:new Date().toISOString()});
 return res.end(JSON.stringify({id}));
 }
 if(!['Espèces','Virement','App banque','Chèque','Carte','Autre'].includes(body.method))throw Error('Paiement invalide');
 const previous=body.id?list('expensePayments').find(p=>p.id===body.id):null;
 const bank=body.bankId?list('banks').find(b=>b.id===body.bankId&&(b.active||previous?.bankId===b.id)):null;
 if(body.bankId&&!bank)throw Error('Banque introuvable ou désactivée');
 if(body.method==='Chèque'&&(!bank||typeof body.chequeNumber!=='string'||!body.chequeNumber.trim()||!validDate(body.chequeDueDate)))throw Error('Pour un chèque : banque, numéro et date d’échéance obligatoires');
 let attachment=null;
 if(body.attachment){
 const file=body.attachment;
 if(typeof file.name!=='string'||!file.name.trim()||file.name.length>200||typeof file.base64!=='string'||! /^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw Error('Pièce jointe invalide');
 const bytes=Buffer.from(file.base64,'base64');
 if(!bytes.length||bytes.length>5*1024*1024||bytes.toString('base64')!==file.base64)throw Error('Pièce jointe : maximum 5 Mo');
 const isPdf=bytes.subarray(0,5).toString()==='%PDF-';
 const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!((file.mime==='application/pdf'&&isPdf)||(file.mime==='image/png'&&isPng)||(file.mime==='image/jpeg'&&isJpeg)))throw Error('Formats acceptés : PDF, PNG et JPEG');
 attachment={name:file.name.replace(/[\/\\\r\n]/g,'_'),mime:file.mime,bytes};
 }
 db.exec('BEGIN IMMEDIATE');try {
 const expense=list('expenses').find(x=>x.id===body.expenseId);if(!expense)throw Error('Charge introuvable');
 if(expense.active===false&&body.action!=='attachment')throw Error('Cette charge est non active');
 const paid=list('expensePayments').filter(p=>p.expenseId===expense.id&&p.id!==body.id&&p.active!==false).reduce((sum,p)=>sum+p.amountCents,0);
 if(amountCents>expense.amountCents-paid)throw Error('Le paiement dépasse le reste à payer');
 const supplierId=body.supplierId||expense.supplierId;
 const supplier=supplierId?list('suppliers').find(x=>x.id===supplierId):null;
 if(body.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 let attachmentInfo=previous?.attachment||null;
 if(attachment){const attachmentId=Number(db.prepare('INSERT INTO payment_attachments(name,mime,content) VALUES(?,?,?)').run(attachment.name,attachment.mime,attachment.bytes).lastInsertRowid);attachmentInfo={id:attachmentId,name:attachment.name};}
 const updated={active:previous?.active!==false,bankId:bank?.id||null,bankName:bank?.name||'',bankAccount:bank?.account||'',chequeNumber:body.method==='Chèque'?body.chequeNumber.trim():'',chequeDueDate:body.method==='Chèque'?body.chequeDueDate:'',supplierId:supplier?.id||expense.supplierId||null,supplierName:supplier?.name||expense.supplierName||'',attachment:attachmentInfo,expenseId:expense.id,label:expense.label,amount:amountCents/100,amountCents,date:body.date,method:body.method,reference:String(body.reference||''),notes:String(body.notes||''),createdBy:previous?.createdBy||currentUser.name,createdAt:previous?.createdAt||new Date().toISOString()};
 const financialChanged=previous&&(previous.amountCents!==amountCents||previous.method!==body.method||previous.bankId!==updated.bankId||previous.chequeNumber!==updated.chequeNumber||previous.chequeDueDate!==updated.chequeDueDate);
 updated.status=body.method==='Chèque'?(!financialChanged&&previous?.status==='validated'?'validated':'pending'):'validated';
 updated.clearedDate=updated.status==='validated'&&body.method==='Chèque'?previous?.clearedDate||'':'';
 updated.updatedAt=new Date().toISOString();updated.updatedBy=currentUser.name;
 updated.history=previous?[...(previous.history||[]),{action:body.action==='attachment'?'Justificatif joint':'Paiement modifié',at:updated.updatedAt,by:currentUser.name,previous:{...previous,history:undefined}}]:[];
 const id=save(kind,updated,body.id);
 db.exec('COMMIT');return res.end(JSON.stringify({id}));
 }catch(error){db.exec('ROLLBACK');throw error;}
 }
 if(req.method==='DELETE')throw Error('Utilisez Désactiver : aucun élément ne doit être supprimé');
 if(req.method!=='POST')throw Error('Méthode non autorisée');
 if(kind==='products'){
 if(body.imageUrl){let url;try{url=new URL(body.imageUrl);}catch{throw Error('URL image invalide');}if(url.protocol!=='https:'||url.hostname!=='vendorcenter.jumia.com')throw Error('URL image Jumia invalide');}
 delete body.imageId;delete body.imageName;
 if(body.image){const im=body.image;if(typeof im.base64!=='string'||typeof im.name!=='string')throw Error('Image invalide');const bytes=Buffer.from(im.base64,'base64');if(!bytes.length||bytes.length>2*1024*1024||bytes.toString('base64')!==im.base64)throw Error('Image : maximum 2 Mo');const detected=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;if(!detected||detected!==im.mime)throw Error('Image PNG, JPEG ou WebP requise');productImage={name:im.name.slice(0,200),mime:detected,bytes};}delete body.image;

 for(const key of ['barcode','sku'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>150))throw Error('Code-barres ou SKU vendeur invalide');
 if(body.jumiaCommissionPercent!==undefined&&(!Number.isFinite(body.jumiaCommissionPercent)||body.jumiaCommissionPercent<0||body.jumiaCommissionPercent>100))throw Error('Commission Jumia invalide');
 if(body.purchasePrice!==undefined&&(!Number.isFinite(body.purchasePrice)||body.purchasePrice<0))throw Error('Prix d’achat invalide');
 if(typeof body.name!=='string'||!body.name.trim()||![body.price,body.stock,body.min].every(x=>Number.isFinite(x)&&x>=0))throw Error('Produit invalide');
 if(body.id!==undefined){
 const existing=Number.isSafeInteger(body.id)?list('products').find(p=>p.id===body.id):null;
 if(!existing)throw Error('Produit introuvable');
 if(body.stock!==existing.stock)throw Error('Le stock est calculé automatiquement à partir des achats et ventes');
 if(body.expectedStock!==existing.stock)throw Error('Le stock a changé. Rouvrez le produit avant de modifier.');
 }
 if(body.id===undefined)body.initialStock=body.stock;else{delete body.initialStock;delete body.purchased;delete body.sold;}
 delete body.expectedStock;body.name=body.name.trim();
 }
 if(['clients','suppliers'].includes(kind)){
 if(typeof body.name!=='string'||!body.name.trim())throw Error('Nom obligatoire');
 if(body.id!==undefined&&(!Number.isSafeInteger(body.id)||!db.prepare('SELECT id FROM records WHERE id=? AND kind=?').get(body.id,kind)))throw Error('Contact introuvable');
 for(const key of ['phone','email','address','ice'])if(body[key]!==undefined&&typeof body[key]!=='string')throw Error('Informations de contact invalides');
 body.name=body.name.trim();
 }
 if(kind==='documents'){
 if(body.id!==undefined)throw Error('Utilisez le formulaire de modification administrateur');
 if(!['Facture','Devis'].includes(body.type)||!body.lines?.length)throw Error('Document invalide');
 db.exec('BEGIN IMMEDIATE');try{
 body.active=true;const quantities=new Map();body.lines=body.lines.map(l=>{const p=list('products').find(p=>p.id===l.productId);if(!p||p.active===false||!Number.isFinite(l.qty)||l.qty<=0)throw Error('Quantité invalide');quantities.set(p.id,(quantities.get(p.id)||0)+l.qty);return {productId:p.id,name:p.name,qty:l.qty,price:p.price};});
 if(!Number.isFinite(body.tax)||body.tax<0||body.tax>100)throw Error('TVA invalide');
 if(body.type==='Facture')for(const [id,qty] of quantities){const p=list('products').find(p=>p.id===id);if(p.stock<qty)throw Error('Stock insuffisant : '+p.name);save('products',{...p,stock:p.stock-qty},id);}
 body.clientName=list('clients').find(c=>c.id===body.clientId)?.name||'Client comptoir';body.date=new Date().toISOString();body.number=(body.type==='Facture'?'FAC':'DEV')+'-'+String(list('documents').length+1).padStart(5,'0');body.total=body.lines.reduce((s,l)=>s+l.qty*l.price,0)*(1+body.tax/100);const id=save(kind,body);db.exec('COMMIT');return res.end(JSON.stringify({id}));
 }catch(e){db.exec('ROLLBACK');throw e;}}
 if(kind==='inventories'){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Inventaire réservé aux administrateurs'}));}
 if(body.id!==undefined)throw Error('Utilisez Modifier');
 const product=list('products').find(p=>p.id===body.productId&&p.active!==false);
 if(!product||!Number.isFinite(body.counted)||body.counted<0||typeof body.reason!=='string'||!body.reason.trim())throw Error('Article, quantité comptée et motif obligatoires');
 if(body.expectedStock!==product.stock)throw Error('Le stock a changé. Rechargez avant de valider l’inventaire');
 const id=save(kind,{productId:product.id,name:product.name,counted:body.counted,previousStock:product.stock,delta:body.counted-product.stock,reason:body.reason.trim(),date:new Date().toISOString(),createdBy:currentUser.name,active:true});return res.end(JSON.stringify({id}));
 }
 if(kind==='movements'){
 if(body.id!==undefined){
 if(body.action!=='receive')throw Error('Utilisez le formulaire de modification administrateur');
 const old=list('movements').find(m=>m.id===body.id);if(!old||old.active===false||old.status!=='pending')throw Error('Achat en instance introuvable');
 if(JSON.stringify(old)!==body.expectedRecord)throw Error('Cette opération a changé. Rechargez la page');
 const updated={...old,status:'received',receivedAt:new Date().toISOString(),receivedBy:currentUser.name};
 db.exec('BEGIN IMMEDIATE');try{save(kind,updated,old.id);auditRecord(db,kind,old,updated,currentUser,'Réception','Achat reçu');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return res.end('{}');
 }
 if(body.status!==undefined&&!['pending','received'].includes(body.status))throw Error('État de réception invalide');
 if(body.unitPrice!==undefined&&(!Number.isFinite(body.unitPrice)||body.unitPrice<0))throw Error('Prix achat invalide');
 const supplier=body.supplierId?list('suppliers').find(s=>s.id===body.supplierId&&s.active!==false):null;if(body.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 body.status=body.status||'received';body.supplierName=supplier?.name||'';
 const lines=purchaseLines(body,list('products'));
 db.exec('BEGIN');try{const id=save(kind,{...body,lines,total:lines.reduce((sum,l)=>sum+l.total,0),active:true,name:lines.map(l=>l.name).join(', '),date:new Date().toISOString()});db.exec('COMMIT');return res.end(JSON.stringify({id}));}catch(e){db.exec('ROLLBACK');throw e;}}
 if(kind==='cheques'){
 if(!body.beneficiary?.trim()||!Number.isFinite(body.amount)||body.amount<=0)throw Error('Chèque invalide');
 const currency=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data||'{}').currency||'MAD';
 body.words=amountToWords(body.amount,currency);body.city='Rabat';
 }
 if(body.id!==undefined){
 if(currentUser.role!=='admin'){res.writeHead(403);return res.end(JSON.stringify({error:'Accès administrateur requis'}));}
 const old=list(kind).find(x=>x.id===body.id);if(!old)throw Error('Élément introuvable');
 const updated={...old,...body,active:old.active!==false,updatedAt:new Date().toISOString(),updatedBy:currentUser.name};delete updated.expectedStock;
 db.exec('BEGIN');try{if(productImage){updated.imageId=Number(db.prepare('INSERT INTO product_images(name,mime,content) VALUES(?,?,?)').run(productImage.name,productImage.mime,productImage.bytes).lastInsertRowid);updated.imageName=productImage.name;}save(kind,updated,old.id);auditRecord(db,kind,old,updated,currentUser,'Modification','Correction via le formulaire');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return res.end(JSON.stringify({id:old.id}));
 }
 if(kind==='products'){db.exec('BEGIN');try{if(productImage){body.imageId=Number(db.prepare('INSERT INTO product_images(name,mime,content) VALUES(?,?,?)').run(productImage.name,productImage.mime,productImage.bytes).lastInsertRowid);body.imageName=productImage.name;}const id=save(kind,{...body,active:true});db.exec('COMMIT');return res.end(JSON.stringify({id}));}catch(e){db.exec('ROLLBACK');throw e;}}
 return res.end(JSON.stringify({id:save(kind,{...body,active:true})}));
 }
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','app.js','style.css','login.js','charges.js','amount-words.js','cheque-print.js','admin-records.js','settlement-math.js','settlements.js','jumia-math.js','jumia.js','jumia-import.js'].includes(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'public',file)));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
initialization.then(()=>server.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',()=>console.log('GestStock démarré'))).catch(error=>{console.error(error.message);process.exit(1);});
