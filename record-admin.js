const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function setupRecordAudit(db){db.exec('CREATE TABLE IF NOT EXISTS record_audit(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,record_id INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,reason TEXT NOT NULL,before_data TEXT NOT NULL,after_data TEXT NOT NULL)');}
function auditRecord(db,kind,before,after,user,action,reason){db.prepare('INSERT INTO record_audit(kind,record_id,action,actor,at,reason,before_data,after_data) VALUES(?,?,?,?,?,?,?,?)').run(kind,before.id,action,user.name,new Date().toISOString(),reason||'',JSON.stringify(before),JSON.stringify(after));}
function handleRecordAdmin({db,body,user,list,save}){
 const allowed=['products','clients','suppliers','documents','cheques','movements','expenses','expensePayments','banks'];
 if(!allowed.includes(body.kind)||!Number.isSafeInteger(body.id)||!['modify','setActive'].includes(body.action))throw Error('Opération invalide');
 if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw Error('Motif obligatoire');
 db.exec('BEGIN IMMEDIATE');try{
 const kind=body.kind,old=list(kind).find(x=>x.id===body.id);if(!old)throw Error('Élément introuvable');
 if(JSON.stringify(old)!==body.expectedRecord)throw Error('Cet élément a changé. Rechargez la page avant de modifier.');
 let updated={...old};
 if(body.action==='setActive'){
 if(typeof body.active!=='boolean'||body.active===(old.active!==false))throw Error('État invalide');updated.active=body.active;
 }else{
 const data=body.data||{};
 if(kind==='expenses'){
 if(typeof data.label!=='string'||!data.label.trim()||typeof data.category!=='string'||!data.category.trim()||!validDate(data.date)||!Number.isFinite(data.amount)||data.amount<=0||!Number.isSafeInteger(Math.round(data.amount*100))||Math.abs(data.amount*100-Math.round(data.amount*100))>0.00001)throw Error('Charge invalide');
 const reserved=list('expensePayments').filter(p=>p.expenseId===old.id&&p.active!==false).reduce((s,p)=>s+p.amountCents,0);
 if(Math.round(data.amount*100)<reserved)throw Error('Le montant ne peut pas être inférieur aux paiements actifs déjà enregistrés');
 const supplier=data.supplierId?list('suppliers').find(x=>x.id===data.supplierId):null;if(data.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 Object.assign(updated,{label:data.label.trim(),category:data.category.trim(),date:data.date,amount:data.amount,amountCents:Math.round(data.amount*100),supplierId:supplier?.id||null,supplierName:supplier?.name||'',reference:String(data.reference||''),notes:String(data.notes||'')});
 }else if(kind==='documents'){
 if(!Array.isArray(data.lines)||!data.lines.length||!Number.isFinite(data.tax)||data.tax<0||data.tax>100)throw Error('Document invalide');
 const lines=data.lines.map(l=>{const product=list('products').find(p=>p.id===l.productId);if(!product||!Number.isFinite(l.qty)||l.qty<=0||!Number.isFinite(l.price)||l.price<0)throw Error('Ligne invalide');return {productId:product.id,name:product.name,qty:l.qty,price:l.price};});
 const client=data.clientId?list('clients').find(c=>c.id===data.clientId):null;if(data.clientId&&!client)throw Error('Client introuvable');
 Object.assign(updated,{lines,tax:data.tax,clientId:client?.id||null,clientName:client?.name||'Client comptoir',total:lines.reduce((s,l)=>s+l.qty*l.price,0)*(1+data.tax/100)});
 }else if(kind==='movements'){
 const product=list('products').find(p=>p.id===data.productId);if(!product||!Number.isFinite(data.qty)||data.qty<=0)throw Error('Réception invalide');
 const supplier=data.supplierId?list('suppliers').find(x=>x.id===data.supplierId):null;if(data.supplierId&&!supplier)throw Error('Fournisseur introuvable');
 Object.assign(updated,{productId:product.id,name:product.name,qty:data.qty,supplierId:supplier?.id||null,reference:String(data.reference||'')});
 }else if(kind==='cheques'){
 if(typeof data.beneficiary!=='string'||!data.beneficiary.trim()||!Number.isFinite(data.amount)||data.amount<=0||!validDate(data.date))throw Error('Chèque invalide');
 Object.assign(updated,{beneficiary:data.beneficiary.trim(),amount:data.amount,date:data.date,reference:String(data.reference||''),city:'Rabat',words:require('./public/amount-words').amountToWords(data.amount)});
 }else throw Error('Utilisez le formulaire Modifier de cet élément');
 }
 if(kind==='expensePayments'&&updated.active!==false){
 const expense=list('expenses').find(x=>x.id===updated.expenseId);if(!expense||expense.active===false)throw Error('Réactivez la charge avant son paiement');
 const other=list('expensePayments').filter(p=>p.id!==old.id&&p.expenseId===old.expenseId&&p.active!==false).reduce((s,p)=>s+p.amountCents,0);if(other+old.amountCents>expense.amountCents)throw Error('Le paiement dépasse le reste à payer');
 }
 const stockEffects=record=>{
 if(record.active===false)return [];
 if(kind==='documents'&&record.type==='Facture')return record.lines.map(l=>[l.productId,-l.qty]);
 if(kind==='movements')return [[record.productId,record.qty]];
 return [];
 };
 const differences=new Map();for(const [id,q] of stockEffects(old))differences.set(id,(differences.get(id)||0)-q);for(const [id,q] of stockEffects(updated))differences.set(id,(differences.get(id)||0)+q);
 for(const [id,delta] of differences){if(!delta)continue;const product=list('products').find(p=>p.id===id);if(!product||product.stock+delta<0)throw Error('Stock insuffisant pour cette modification');save('products',{...product,stock:product.stock+delta},id);}
 updated.updatedAt=new Date().toISOString();updated.updatedBy=user.name;save(kind,updated,old.id);auditRecord(db,kind,old,updated,user,body.action==='setActive'?(updated.active?'Réactivation':'Désactivation'):'Modification',body.reason.trim());db.exec('COMMIT');return {id:old.id};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={setupRecordAudit,auditRecord,handleRecordAdmin};
