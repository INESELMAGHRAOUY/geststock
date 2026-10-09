const {test}=require('node:test');const assert=require('node:assert/strict');const {DatabaseSync}=require('node:sqlite');const {setupRecordAudit,handleRecordAdmin}=require('../record-admin');
test('admin corrects generated rent, preserves cheque and audits; stock changes are reversible',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY,kind TEXT,data TEXT)');setupRecordAudit(db);
 const list=kind=>db.prepare('SELECT id,data FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
 const save=(kind,data,id)=>{if(id){db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data),id);return id;}return Number(db.prepare('INSERT INTO records(kind,data) VALUES(?,?)').run(kind,JSON.stringify(data)).lastInsertRowid);};
 const user={name:'Mustapha'};const change=(kind,id,action,data,active)=>handleRecordAdmin({db,list,save,user,body:{kind,id,action,data,active,reason:'Correction',expectedRecord:JSON.stringify(list(kind).find(r=>r.id===id))}});
 const expense=save('expenses',{label:'LKRA',category:'Loyer',amount:1250,amountCents:125000,date:'2026-10-01',recurringId:4});
 const payment=save('expensePayments',{expenseId:expense,amountCents:125000,status:'pending'});
 change('expenses',expense,'modify',{label:'LKRA',category:'Loyer',amount:2150,date:'2026-10-01'});
 assert.equal(list('expenses')[0].amountCents,215000);assert.equal(list('expenses')[0].recurringId,4);assert.equal(list('expensePayments')[0].amountCents,125000);
 assert.throws(()=>change('expenses',expense,'modify',{label:'LKRA',category:'Loyer',amount:1000,date:'2026-10-01'}),/inférieur/);assert.equal(list('expenses')[0].amount,2150);
 change('expensePayments',payment,'setActive',null,false);assert.equal(list('expensePayments').length,1);
 const product=save('products',{name:'A',stock:8});const invoice=save('documents',{type:'Facture',lines:[{productId:product,qty:2,price:10}],tax:0});
 change('documents',invoice,'modify',{lines:[{productId:product,qty:3,price:10}],tax:0});assert.equal(list('products')[0].stock,7);
 change('documents',invoice,'setActive',null,false);assert.equal(list('products')[0].stock,10);
 change('documents',invoice,'setActive',null,true);assert.equal(list('products')[0].stock,7);
 assert.throws(()=>change('documents',invoice,'modify',{lines:[{productId:product,qty:20,price:10}],tax:0}),/Stock insuffisant/);assert.equal(list('products')[0].stock,7);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM record_audit').get().n,5);db.close();
});
