const {billBalances,validateAllocation}=require('./public/settlement-math');const {auditRecord}=require('./record-admin');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function handleSettlement({db,list,save,user,body}){
 const state=()=>Object.fromEntries(['movements','documents','suppliers','clients','settlements'].map(k=>[k,list(k)]));
 db.exec('BEGIN IMMEDIATE');try{
 const old=body.id!==undefined?list('settlements').find(p=>p.id===body.id):null;if(body.id!==undefined&&!old)throw Error('Règlement introuvable');
 if(old){if(user.role!=='admin')throw Error('Modification réservée aux administrateurs');if(body.expectedRecord!==JSON.stringify(old))throw Error('Le règlement a changé. Rechargez');}
 let updated;
 if(body.action==='setActive'){
 if(!old||typeof body.active!=='boolean'||body.active===(old.active!==false)||!body.reason?.trim())throw Error('État et motif obligatoires');
 if(body.active)validateAllocation(state(),old.side,old.allocations,old.id,old.partyId);updated={...old,active:body.active};
 }else if(body.action==='validate'){
 if(!old||old.active===false||old.method!=='Chèque'||old.status!=='pending'||!validDate(body.clearedDate)||body.clearedDate>new Date().toISOString().slice(0,10))throw Error('Validation ou date d’encaissement invalide');
 validateAllocation(state(),old.side,old.allocations,old.id,old.partyId);updated={...old,status:'validated',clearedDate:body.clearedDate};
 }else{
 if(old&&old.active===false)throw Error('Réactivez ce règlement avant modification');
 if(!['supplier','client'].includes(body.side)||!Number.isSafeInteger(body.partyId)||!validDate(body.date)||!['Espèces','Virement','App banque','Chèque','Carte','Autre'].includes(body.method))throw Error('Informations de règlement invalides');
 const amountCents=Math.round(body.amount*100);if(!Number.isFinite(body.amount)||amountCents<=0||!Number.isSafeInteger(amountCents)||Math.abs(body.amount*100-amountCents)>0.00001)throw Error('Montant invalide');
 const balances=billBalances(state(),body.side,old?.id);if(!Array.isArray(body.billIds)||!body.billIds.length||new Set(body.billIds).size!==body.billIds.length)throw Error('Sélectionnez des bons distincts');
 let remaining=amountCents;const allocations=[];for(const id of body.billIds){const bill=balances.find(b=>b.id===id&&b.partyId===body.partyId);if(!bill||bill.availableCents<=0)throw Error('Bon indisponible pour ce tiers');if(!body.expectedBalances||body.expectedBalances[String(id)]!==bill.availableCents)throw Error('Le solde a changé. Rouvrez le règlement');const amount=Math.min(remaining,bill.availableCents);if(amount>0)allocations.push({billId:id,reference:bill.reference,amountCents:amount});remaining-=amount;}
 if(remaining>0)throw Error('Le montant dépasse le total disponible des bons sélectionnés');
 const bank=body.bankId?list('banks').find(b=>b.id===body.bankId&&b.active):null;if(body.bankId&&!bank)throw Error('Banque indisponible');
 if(['Virement','App banque','Carte'].includes(body.method)&&!bank)throw Error('Sélectionnez la banque de ce règlement');
 if(body.method==='Chèque'&&(!bank||typeof body.chequeNumber!=='string'||!body.chequeNumber.trim()||!validDate(body.chequeDueDate)))throw Error('Banque, numéro et échéance du chèque obligatoires');
 const changed=old&&(old.amountCents!==amountCents||old.method!==body.method||old.bankId!==(bank?.id||null)||old.chequeNumber!==String(body.chequeNumber||'')||old.chequeDueDate!==String(body.chequeDueDate||'')||old.side!==body.side||old.partyId!==body.partyId||JSON.stringify(old.allocations)!==JSON.stringify(allocations));
 updated={side:body.side,partyId:body.partyId,partyName:balances.find(b=>b.partyId===body.partyId)?.partyName||'',amount:body.amount,amountCents,date:body.date,method:body.method,bankId:bank?.id||null,bankName:bank?.name||'',chequeNumber:body.method==='Chèque'?body.chequeNumber.trim():'',chequeDueDate:body.method==='Chèque'?body.chequeDueDate:'',status:body.method==='Chèque'?(old?.status==='validated'&&!changed?'validated':'pending'):'validated',reference:String(body.reference||''),notes:String(body.notes||''),allocations,active:true,createdAt:old?.createdAt||new Date().toISOString(),createdBy:old?.createdBy||user.name};
 if(updated.status==='validated'&&updated.method==='Chèque')updated.clearedDate=old?.clearedDate;
 }
 updated.updatedAt=new Date().toISOString();updated.updatedBy=user.name;const id=save('settlements',updated,old?.id);if(old)auditRecord(db,'settlements',old,{...updated,id},user,body.action==='setActive'?(updated.active?'Réactivation':'Désactivation'):body.action==='validate'?'Encaissement validé':'Modification',body.reason||'Règlement corrigé');db.exec('COMMIT');return {id};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={handleSettlement};
