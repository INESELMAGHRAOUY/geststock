function createLoanPeople({db}){
 db.exec('CREATE TABLE IF NOT EXISTS personal_loan_people(id INTEGER PRIMARY KEY,name_key TEXT NOT NULL UNIQUE,data TEXT NOT NULL)');
 const key=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
 const all=()=>db.prepare('SELECT id,data FROM personal_loan_people ORDER BY id').all().map(r=>({...JSON.parse(r.data),id:r.id}));
 function resolve(name,id,user){if(id!==undefined&&id!==null&&id!==0){const person=all().find(p=>p.id===id&&p.active!==false);if(!person)throw Error('Personne identifiée introuvable');return person;}if(typeof name!=='string'||!name.trim()||name.trim().length>120)throw Error('Nom de la personne obligatoire (120 caractères maximum)');name=name.trim().replace(/\s+/g,' ');const norm=key(name),old=db.prepare('SELECT id,data FROM personal_loan_people WHERE name_key=?').get(norm);if(old)return {...JSON.parse(old.data),id:old.id};const data={name,active:true,createdBy:user?.name||'Identification des prêts existants',createdAt:new Date().toISOString()},personId=Number(db.prepare('INSERT INTO personal_loan_people(name_key,data) VALUES(?,?)').run(norm,JSON.stringify(data)).lastInsertRowid);return {...data,id:personId};}
 db.exec('BEGIN IMMEDIATE');try{for(const row of db.prepare('SELECT id,data FROM personal_loans ORDER BY id').all()){const loan=JSON.parse(row.data);if(loan.personId)continue;const person=resolve(loan.person||'Personne du prêt #'+row.id,null,null);db.prepare('UPDATE personal_loans SET data=? WHERE id=?').run(JSON.stringify({...loan,personId:person.id}),row.id);}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 return {all,resolve};
}
module.exports={createLoanPeople};
