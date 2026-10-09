const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('pending cheque card excludes paid, inactive and archived-charge payments and updates after clearing',()=>{
 const state={expenseLifecycleHistory:[],currentUser:{role:'admin'},expenses:[{id:1,amountCents:215000},{id:2,amountCents:50000,active:false}],expensePayments:[{id:1,expenseId:1,method:'Chèque',status:'pending',amountCents:125000},{id:2,expenseId:1,method:'App banque',status:'validated',amountCents:14900},{id:3,expenseId:1,method:'Chèque',status:'validated',amountCents:50000},{id:4,expenseId:1,method:'Chèque',status:'pending',amountCents:10000,active:false},{id:5,expenseId:2,method:'Chèque',status:'pending',amountCents:50000}]};
 const context={state,document:{addEventListener(){},querySelector(){return {addEventListener(){}};}},money:value=>Number(value).toFixed(2)+' MAD',table:()=>''};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/charges.js'),'utf8'),context);vm.runInContext("chargeTab='deleted'",context);
 const card=label=>{const html=vm.runInContext('renderCharges()',context);return html.match(new RegExp(label+'<strong>([^<]+)</strong>'))[1];};
 assert.equal(card('Chèques en instance'),'1250.00 MAD');assert.equal(card('Montant payé'),'649.00 MAD');assert.equal(card('Reste à payer'),'1501.00 MAD');
 state.expensePayments[0].amountCents=135000;assert.equal(card('Chèques en instance'),'1350.00 MAD');
 state.expensePayments[0].status='validated';assert.equal(card('Chèques en instance'),'0.00 MAD');assert.equal(card('Montant payé'),'1999.00 MAD');
 state.expensePayments[0].status='pending';state.expensePayments[0].active=false;assert.equal(card('Chèques en instance'),'0.00 MAD');
});
