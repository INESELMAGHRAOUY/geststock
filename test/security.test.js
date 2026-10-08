const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {DatabaseSync}=require('node:sqlite');
test('authentification, origine et sauvegarde SQLite',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'geststock-auth-'));
 const password='test-only-password-12345';
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,ALLOW_LOCAL_NO_AUTH:'0',HOST:'127.0.0.1',PORT:'3101',ADMIN_USER:'admin',ADMIN_PASSWORD:password,DB_PATH:path.join(dir,'stock.db')}});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('Startup '+c)));});
 const url='http://127.0.0.1:3101';
 const unauthenticated=await fetch(url,{redirect:'manual'});assert.equal(unauthenticated.status,303);assert.equal(unauthenticated.headers.get('location'),'/login');assert.equal(unauthenticated.headers.get('www-authenticate'),null);
 assert.match(await(await fetch(url+'/login')).text(),/login-form/);assert.equal((await fetch(url+'/login.js')).status,200);
 assert.equal((await fetch(url+'/api/state')).status,401);
 const login=credentials=>fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify(credentials)});
 assert.equal((await login({username:'admin',password:'wrong'})).status,401);
 const response=await login({username:'admin',password});assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 const auth={Cookie:cookie.split(';')[0]};
 assert.equal((await fetch(url,{headers:auth})).status,200);assert.equal((await fetch(url+'/api/state',{headers:auth})).status,200);
 assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...auth,Origin:'https://other.example'},body:'{}'})).status,403);
 assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...auth,Origin:url},body:'{}'})).status,200);
 assert.equal((await fetch(url+'/api/logout',{method:'POST',headers:{...auth,Origin:url},body:'{}'})).status,200);
 assert.equal((await fetch(url+'/api/state',{headers:auth})).status,401);
 await new Promise(r=>setTimeout(r,100));const file=fs.readdirSync(path.join(dir,'backups')).find(f=>f.endsWith('.db'));assert.ok(file);
 const db=new DatabaseSync(path.join(dir,'backups',file));assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='records'").get());db.close();
 }finally{await new Promise(r=>{child.once('exit',r);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
