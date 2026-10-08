// Monthly schedules use UTC dates and a persistent cursor, including paused months.
function setupRecurring(db, today=new Date().toISOString().slice(0,10)){
 db.exec(`CREATE TABLE IF NOT EXISTS recurring_charges(id INTEGER PRIMARY KEY,label TEXT NOT NULL,category TEXT NOT NULL,amount_cents INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,start_month TEXT NOT NULL,last_month TEXT);
 CREATE TABLE IF NOT EXISTS app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS recurring_occurrences(schedule_id INTEGER NOT NULL,month TEXT NOT NULL,expense_id INTEGER NOT NULL,PRIMARY KEY(schedule_id,month));`);
 if(!db.prepare('PRAGMA table_info(recurring_charges)').all().some(x=>x.name==='supplier_id'))db.exec('ALTER TABLE recurring_charges ADD COLUMN supplier_id INTEGER');
 if(!db.prepare("SELECT value FROM app_metadata WHERE key='recurring-defaults-v1'").get()){
 db.exec('BEGIN IMMEDIATE');try{
 for(const [label,category,amount] of [['WIFI','Internet',14900],['LKRA','Loyer',125000],['TISALAT LMAGHRIB','Télécommunications',5900],['LA CRECHE DYAL OMAR','Crèche',50000]])db.prepare('INSERT INTO recurring_charges(label,category,amount_cents,start_month) VALUES(?,?,?,?)').run(label,category,amount,today.slice(0,7));
 db.prepare('INSERT INTO app_metadata VALUES(?,?)').run('recurring-defaults-v1','1');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 }
}
function nextMonth(month){const [year,m]=month.split('-').map(Number);return `${year+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}`;}
function syncRecurring(db,today=new Date().toISOString().slice(0,10)){
 const current=today.slice(0,7);db.exec('BEGIN IMMEDIATE');try{
 for(const schedule of db.prepare('SELECT * FROM recurring_charges').all()){
 let month=schedule.last_month?nextMonth(schedule.last_month):schedule.start_month;
 if(month<schedule.start_month)month=schedule.start_month;
 while(month<=current){
 if(schedule.active&&!db.prepare('SELECT expense_id FROM recurring_occurrences WHERE schedule_id=? AND month=?').get(schedule.id,month)){
 const data={label:schedule.label,category:schedule.category,amount:schedule.amount_cents/100,amountCents:schedule.amount_cents,date:month+'-01',supplierId:schedule.supplier_id||null,supplierName:JSON.parse(db.prepare("SELECT data FROM records WHERE kind='suppliers' AND id=?").get(schedule.supplier_id||-1)?.data||'{}').name||'',reference:'PER-'+schedule.id+'-'+month,notes:'Charge mensuelle automatique',createdBy:'Automatique',createdAt:new Date().toISOString(),recurringId:schedule.id,period:month};
 const id=Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run('expenses',JSON.stringify(data)).lastInsertRowid);
 db.prepare('INSERT INTO recurring_occurrences VALUES(?,?,?)').run(schedule.id,month,id);
 }
 db.prepare('UPDATE recurring_charges SET last_month=? WHERE id=?').run(month,schedule.id);month=nextMonth(month);
 }
 }db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={setupRecurring,syncRecurring};
