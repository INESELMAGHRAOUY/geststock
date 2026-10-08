const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const {setupRecurring,syncRecurring}=require('../recurring');
test('charges mensuelles : initialisation, doublons, pause, reprise et modification',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY,kind TEXT,data TEXT)');
 const expenses=()=>db.prepare("SELECT data FROM records WHERE kind='expenses'").all().map(x=>JSON.parse(x.data));
 setupRecurring(db,'2026-10-08');syncRecurring(db,'2026-10-08');assert.equal(expenses().length,4);assert.equal(expenses().reduce((s,x)=>s+x.amountCents,0),195800);
 setupRecurring(db,'2026-10-09');syncRecurring(db,'2026-10-09');assert.equal(expenses().length,4);
 const wifi=db.prepare("SELECT * FROM recurring_charges WHERE label='WIFI'").get();db.prepare('UPDATE recurring_charges SET active=0 WHERE id=?').run(wifi.id);
 syncRecurring(db,'2026-11-01');assert.equal(expenses().length,7);assert.equal(expenses().filter(x=>x.recurringId===wifi.id).length,1);
 syncRecurring(db,'2026-12-03');db.prepare('UPDATE recurring_charges SET active=1,amount_cents=19900 WHERE id=?').run(wifi.id);syncRecurring(db,'2026-12-03');assert.equal(expenses().filter(x=>x.recurringId===wifi.id).length,1);
 syncRecurring(db,'2027-01-01');let rows=expenses().filter(x=>x.recurringId===wifi.id);assert.equal(rows.length,2);assert.equal(rows[0].amountCents,14900);assert.equal(rows[1].amountCents,19900);
 syncRecurring(db,'2027-03-01');rows=expenses().filter(x=>x.recurringId===wifi.id);assert.equal(rows.length,4);assert.equal(rows.at(-1).date,'2027-03-01');syncRecurring(db,'2027-03-01');assert.equal(expenses().filter(x=>x.recurringId===wifi.id).length,4);db.close();
});
