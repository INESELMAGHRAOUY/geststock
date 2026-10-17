const crypto=require('node:crypto');
const {parseJumiaCSV,analyzeJumiaTransactions}=require('./public/jumia-import');
const {verifyStatementStore}=require('./jumia-store-identity');
const {auditRecord}=require('./record-admin');
const statement=t=>String(t['Statement Number']||'').trim();
function reportUpdatePlan({body,list}){
 const store=list('jumiaStores').find(s=>s.id===body.storeId&&s.active!==false);if(!store)throw Error('Choisissez une boutique active');
 const transactions=parseJumiaCSV(body.csv),statementStoreId=verifyStatementStore(transactions,store);if(transactions.some(t=>!statement(t)))throw Error('Statement Number requis pour mettre à jour un relevé');
 const numbers=[...new Set(transactions.map(statement))],reports=list('jumiaReports').filter(r=>r.active!==false&&r.storeId===store.id),payouts=list('jumiaPayouts').filter(p=>p.active!==false&&p.storeId===store.id),newIds=new Set(transactions.map(t=>t['Transaction Number'])),previous=reports.flatMap(r=>r.transactions.filter(t=>numbers.includes(statement(t))));
 if(reports.some(r=>r.transactions.some(t=>!numbers.includes(statement(t))&&newIds.has(t['Transaction Number']))))throw Error('Une transaction existe dans un autre relevé : import refusé');
 const previousIds=new Set(previous.map(t=>t['Transaction Number']));if(payouts.some(p=>numbers.some(n=>p.statementKey===JSON.stringify([store.id,n])||p.statementNumber===n)||(p.transactionNumbers||[]).some(n=>previousIds.has(n)||newIds.has(n))))throw Error('Réception bancaire déjà confirmée : remplacement du relevé interdit');
 const rows=numbers.map(number=>{const before=previous.filter(t=>statement(t)===number),after=transactions.filter(t=>statement(t)===number),oldById=new Map(before.map(t=>[t['Transaction Number'],t])),afterIds=new Set(after.map(t=>t['Transaction Number'])),oldNet=analyzeJumiaTransactions(before).net,newNet=analyzeJumiaTransactions(after).net;return {number,oldCount:before.length,newCount:after.length,oldNetCents:oldNet,newNetCents:newNet,differenceCents:newNet-oldNet,added:after.filter(t=>!oldById.has(t['Transaction Number'])).length,removed:before.filter(t=>!afterIds.has(t['Transaction Number'])).length,changed:after.filter(t=>oldById.has(t['Transaction Number'])&&JSON.stringify(t)!==JSON.stringify(oldById.get(t['Transaction Number']))).length};});
 const token=crypto.createHash('sha256').update(JSON.stringify({store,transactions,reports,payouts})).digest('hex');return {store,statementStoreId,transactions,numbers,reports,preview:{token,storeName:store.name,replacement:previous.length>0,rows}};
}
function handleReportUpdate({db,body,user,list,save}){
 if(user.role!=='admin')throw Error('Import réservé aux administrateurs');if(!['previewUpdate','commitUpdate'].includes(body.action))throw Error('Action invalide');
 if(body.action==='previewUpdate')return reportUpdatePlan({body,list}).preview;
 db.exec('BEGIN IMMEDIATE');try{const plan=reportUpdatePlan({body,list});if(body.expectedToken!==plan.preview.token)throw Error('Le relevé ou son paiement a changé. Refaites la prévisualisation');
 const at=new Date().toISOString(),record={storeId:plan.store.id,storeName:plan.store.name,statementStoreId:plan.statementStoreId,fileName:String(body.fileName||'Export Jumia.csv').slice(0,200),transactions:plan.transactions,active:true,createdAt:at,createdBy:user.name,updatedAt:at,updatedBy:user.name,replacesReportIds:plan.reports.filter(r=>r.transactions.some(t=>plan.numbers.includes(statement(t)))).map(r=>r.id)};
 const id=save('jumiaReports',record);for(const old of plan.reports){if(!record.replacesReportIds.includes(old.id))continue;const remaining=old.transactions.filter(t=>!plan.numbers.includes(statement(t))),updated={...old,transactions:remaining.length?remaining:old.transactions,active:remaining.length>0,updatedAt:at,updatedBy:user.name,replacedByReportId:id};save('jumiaReports',updated,old.id);auditRecord(db,'jumiaReports',old,{...updated,id:old.id},user,'Remplacement du relevé','CSV actualisé avant confirmation bancaire');}
 auditRecord(db,'jumiaReports',{id},{...record,id},user,plan.preview.replacement?'Import de remplacement':'Import','Prévisualisation confirmée du CSV');db.exec('COMMIT');return {id,replaced:plan.preview.replacement,rows:plan.preview.rows};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={handleReportUpdate,reportUpdatePlan};
