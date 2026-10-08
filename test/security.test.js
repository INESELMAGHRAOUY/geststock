const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {DatabaseSync}=require('node:sqlite');
test('authentification, origine et sauvegarde SQLite',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'geststock-auth-'));
 const password='test-only-password-12345';
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,ALLOW_LOCAL_NO_AUTH:'0',HOST:'127.0.0.1',PORT:'3101',ADMIN_USER:'admin',ADMIN_PASSWORD:password,DB_PATH:path.join(dir,'stock.db')}});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('Startup '+c)));});
 const url='http://127.0.0.1:3101';const auth={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url+'/api/state')).status,401);
 assert.equal((await fetch(url,{headers:{Authorization:'Basic '+Buffer.from('admin:wrong').toString('base64')}})).status,401);
 assert.equal((await fetch(url,{headers:auth})).status,200);
 assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...auth,Origin:'https://other.example'},body:'{}'})).status,403);
 assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...auth,Origin:url},body:'{}'})).status,200);
 await new Promise(r=>setTimeout(r,100));const file=fs.readdirSync(path.join(dir,'backups')).find(f=>f.endsWith('.db'));assert.ok(file);
 const db=new DatabaseSync(path.join(dir,'backups',file));assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='records'").get());db.close();
 }finally{await new Promise(r=>{child.once('exit',r);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
