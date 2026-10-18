const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createPersonalFinance}=require('../personal-finance'),{createBankImportService}=require('../bank-import');
function setup(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE bank_statements(id INTEGER PRIMARY KEY,bank_id INTEGER,file_hash TEXT,data TEXT,pdf BLOB);CREATE TABLE bank_matches(statement_id INTEGER,operation_key TEXT,target_kind TEXT,target_id INTEGER,actor TEXT,at TEXT,PRIMARY KEY(statement_id,operation_key),UNIQUE(target_kind,target_id))');const state={banks:[{id:1,name:'Bank'}],settlements:[{id:9,bankId:1,side:'supplier',amountCents:50000,date:'2026-10-01',status:'validated'}],expensePayments:[],jumiaPayouts:[]};const operations=[{key:'withdrawal',date:'2026-10-01',label:'RETRAIT',debitCents:100000,creditCents:0},{key:'card',date:'2026-10-01',label:'MARJANE',debitCents:50000,creditCents:0}];db.prepare('INSERT INTO bank_statements VALUES(1,1,?,?,?)').run('hash',JSON.stringify({operations}),Buffer.from('PDF'));const list=k=>state[k]||[],service=createPersonalFinance({db,list}),user={role:'admin',name:'Admin'},run=body=>service.handle(user,{statementId:1,...body});return {db,state,list,service,user,run};}
test('personal card splits and cash withdrawals count consumption once and enforce remaining cash',()=>{const {db,service,user,run}=setup();try{
 run({action:'allocate',operationKey:'card',expectedVersion:0,type:'expense',personalCents:30000,professionalCents:20000,category:'Marjane',method:'TPE'});
 run({action:'allocate',operationKey:'withdrawal',expectedVersion:0,type:'withdrawal',personalCents:0,professionalCents:0});
 let data=service.read(user);assert.equal(data.totals.personalBankCents,30000);assert.equal(data.totals.cashRemainingCents,100000);assert.equal(data.totals.personalCashCents,0);
 const expense=run({action:'cashSave',operationKey:'withdrawal',expectedVersion:0,personalCents:30000,professionalCents:40000,date:'2026-10-02',category:'Courses'});
 data=service.read(user);assert.equal(data.totals.cashRemainingCents,30000);assert.equal(data.totals.personalCashCents,30000);assert.equal(data.totals.professionalCents,60000);
 assert.throws(()=>run({action:'cashSave',operationKey:'withdrawal',expectedVersion:0,personalCents:31000,professionalCents:0,date:'2026-10-03',category:'Autre'}),/dépassent/);
 assert.throws(()=>run({action:'allocate',operationKey:'withdrawal',expectedVersion:1,type:'expense',personalCents:100000,professionalCents:0,category:'Autre',method:'Espèces'}),/possède des dépenses/);
 run({action:'cashDelete',operationKey:'withdrawal',id:expense.id,expectedVersion:1,reason:'Correction'});assert.equal(service.read(user).totals.cashRemainingCents,100000);assert.equal(service.read(user).operations.find(o=>o.key==='withdrawal').cashExpenses.length,1);
 assert.throws(()=>run({action:'cashSave',operationKey:'withdrawal',id:expense.id,expectedVersion:1,personalCents:1,professionalCents:0,date:'2026-10-02',category:'Autre'}),/ont changé/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM personal_finance_audit').get().n,4);
 }finally{db.close();}});
test('invalid splits, stale edits and unauthorized access are rejected; personal allocations cannot match professional payments',async()=>{const {db,state,list,service,user,run}=setup();try{
 assert.throws(()=>service.read({role:'user'}),/administrateur/);
 assert.throws(()=>run({action:'allocate',operationKey:'card',expectedVersion:0,type:'expense',personalCents:100,professionalCents:0,category:'BIM',method:'TPE'}),/exactement/);
 run({action:'allocate',operationKey:'card',expectedVersion:0,type:'expense',personalCents:50000,professionalCents:0,category:'BIM',method:'TPE'});
 const bank=createBankImportService({db,list});await assert.rejects(()=>bank.handle(user,{action:'match',statementId:1,operationKey:'card',kind:'settlements',targetId:9}),/intégral interdit/);
 assert.equal(state.settlements.length,1);assert.equal(state.settlements[0].amountCents,50000);
 db.prepare('INSERT INTO bank_matches VALUES(?,?,?,?,?,?)').run(1,'withdrawal','settlements',20,'Admin','now');assert.throws(()=>run({action:'allocate',operationKey:'withdrawal',expectedVersion:0,type:'withdrawal',personalCents:0,professionalCents:0}),/déjà rapprochée/);
 }finally{db.close();}});
test('professional subtypes validate counterparties and retain professional metadata in allocations',()=>{
 const {normalizeImportClassification}=require('../personal-finance');const op={debitCents:50000,creditCents:0},list=k=>({clients:[{id:1,name:'Client A',active:true},{id:2,name:'Inactive',active:false}],suppliers:[{id:3,name:'Supplier A'}],jumiaStores:[{id:4,name:'Store A'}]}[k]||[]);
 assert.equal(normalizeImportClassification(op,{nature:'professional',professionalType:'client',professionalPartyId:1},list).professionalName,'Client A');
 assert.equal(normalizeImportClassification(op,{nature:'professional',professionalType:'supplier',professionalPartyId:3},list).professionalName,'Supplier A');
 assert.equal(normalizeImportClassification(op,{nature:'professional',professionalType:'jumia',professionalPartyId:4},list).professionalName,'Store A');
 assert.equal(normalizeImportClassification(op,{nature:'professional',professionalType:'delivery',deliveryCompany:' Ozon Express '},list).professionalName,'Ozon Express');
 assert.throws(()=>normalizeImportClassification(op,{nature:'professional',professionalType:'client',professionalPartyId:2},list),/inactif/);
 assert.throws(()=>normalizeImportClassification(op,{nature:'professional',professionalType:''},list),/Choisissez/);
 assert.throws(()=>normalizeImportClassification(op,{nature:'professional',professionalType:'delivery'},list),/société/);
 const {db,service,user,run}=setup();try{run({action:'allocate',operationKey:'card',expectedVersion:0,type:'expense',personalCents:0,professionalCents:50000,category:'Autre',method:'TPE',professionalType:'delivery',deliveryCompany:'Delivery A'});const a=service.read(user).operations.find(o=>o.key==='card').allocation;assert.equal(a.professionalType,'delivery');assert.equal(a.professionalName,'Delivery A');}finally{db.close();}
});
