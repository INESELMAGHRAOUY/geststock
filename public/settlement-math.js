(function(root){
 const cents=value=>Math.round(Number(value||0)*100);
 function tradeBills(state,side){return (side==='supplier'?state.movements:state.documents).filter(b=>b.active!==false&&(side==='supplier'?b.status!=='pending':b.type==='Facture')).map(b=>({id:b.id,partyId:side==='supplier'?b.supplierId||0:b.clientId||0,partyName:side==='supplier'?b.supplierName||state.suppliers?.find(s=>s.id===b.supplierId)?.name||'Fournisseur non renseigné':b.clientName||'Client comptoir',reference:b.reference||b.number||'#'+b.id,date:String(b.date||'').slice(0,10),totalCents:cents(b.total??(b.qty*(b.unitPrice||0)))}));}
 function billBalances(state,side,excludeId){return tradeBills(state,side).map(b=>{
 let paidCents=0,pendingCents=0;for(const p of state.settlements||[])if(p.id!==excludeId&&p.active!==false&&p.side===side)for(const a of p.allocations)if(a.billId===b.id){if(p.status==='pending')pendingCents+=a.amountCents;else paidCents+=a.amountCents;}
 return {...b,paidCents,pendingCents,remainingCents:b.totalCents-paidCents,availableCents:b.totalCents-paidCents-pendingCents};});}
 function tradeSummary(state){const suppliers=billBalances(state,'supplier'),clients=billBalances(state,'client');const payable=suppliers.reduce((s,b)=>s+b.remainingCents,0),receivable=clients.reduce((s,b)=>s+b.remainingCents,0);return {payable,receivable,net:receivable-payable,purchases:suppliers.reduce((s,b)=>s+b.totalCents,0),supplierPaid:suppliers.reduce((s,b)=>s+b.paidCents,0),sales:clients.reduce((s,b)=>s+b.totalCents,0),clientPaid:clients.reduce((s,b)=>s+b.paidCents,0)};}
 function validateAllocation(state,side,allocations,excludeId,partyId){const balances=billBalances(state,side,excludeId);for(const a of allocations){const bill=balances.find(b=>b.id===a.billId);if(!bill||(partyId!==undefined&&bill.partyId!==partyId)||a.amountCents>bill.availableCents)throw Error('Un bon a changé ou le règlement dépasse son solde');}}
 function treasuryBalances(state){
 const accounts=[{id:0,name:'Caisse / espèces'},...(state.banks||[]).map(b=>({id:b.id,name:b.name}))];
 return accounts.map(account=>{
 const opening=(state.accountOpenings||[]).find(o=>o.bankId===account.id),start=opening?.date||'0000-00-00';let receipts=0,outgoing=0;
 const accountId=p=>p.method==='Espèces'?0:p.bankId||0;
 for(const p of state.settlements||[])if(p.active!==false&&p.status==='validated'&&accountId(p)===account.id&&(p.clearedDate||p.date)>=start){if(p.side==='client')receipts+=p.amountCents;else outgoing+=p.amountCents;}
 for(const p of state.expensePayments||[])if(p.active!==false&&(p.method!=='Chèque'||p.status==='validated')&&accountId(p)===account.id&&(p.clearedDate||p.date)>=start)outgoing+=p.amountCents;
 return {...account,opening,receipts,outgoing,balance:(opening?.amountCents||0)+receipts-outgoing};
 });
 }
 root.tradeBills=tradeBills;root.billBalances=billBalances;root.tradeSummary=tradeSummary;root.validateAllocation=validateAllocation;root.treasuryBalances=treasuryBalances;
 if(typeof module!=='undefined'&&module.exports)module.exports={tradeBills,billBalances,tradeSummary,validateAllocation,treasuryBalances};
})(globalThis);
