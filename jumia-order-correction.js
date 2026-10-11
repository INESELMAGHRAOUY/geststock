const {parseCSV}=require('./public/jumia-import');
const {handleJumia}=require('./jumia');
const {auditRecord}=require('./record-admin');
function previewCorrection(body,list){
 const stores=list('jumiaStores'),source=stores.find(s=>s.id===body.sourceStoreId),target=stores.find(s=>s.id===body.targetStoreId&&s.active!==false);
 if(!source||!target||source.id===target.id)throw Error('Choisissez deux boutiques différentes');
 const rows=parseCSV(body.csv);if(['Order Number','Seller Sku'].some(k=>!(k in rows[0])))throw Error('Export commandes Jumia attendu');
 const orders=list('jumiaOrders'),reports=list('jumiaReports');
 const items=[...new Set(rows.map(r=>r['Order Number']))].map(number=>{
 const order=orders.find(o=>o.storeId===source.id&&String(o.number)===number&&o.active!==false),errors=[];
 if(!order)errors.push('Commande active introuvable dans la boutique source');
 if(orders.some(o=>o.storeId===target.id&&String(o.number)===number))errors.push('Numéro déjà présent dans la boutique destination');
 if(reports.some(r=>r.active!==false&&r.storeId===source.id&&r.transactions?.some(t=>t['Order No.']===number)))errors.push('Relevé financier lié : corrigez le rapprochement avant de déplacer');
 if(order){const csvQty=new Map(),savedQty=new Map();for(const row of rows.filter(r=>r['Order Number']===number))csvQty.set(row['Seller Sku'],(csvQty.get(row['Seller Sku'])||0)+1);for(const l of order.lines)savedQty.set(l.sku,(savedQty.get(l.sku)||0)+l.qty);if(csvQty.size!==savedQty.size||[...csvQty].some(([sku,qty])=>savedQty.get(sku)!==qty))errors.push('SKU / quantités différents : vérifiez le fichier');for(const line of order.lines){const listing=target.listings?.find(l=>l.sku===line.sku);if(listing&&(listing.active===false||(listing.productId||null)!==(line.productId||null)))errors.push('Listing destination incompatible : '+line.sku);}}
 return {number,orderId:order?.id,expectedRecord:order?JSON.stringify(order):null,errors};});
 return {sourceName:source.name,targetName:target.name,targetRecord:JSON.stringify(target),orders:items};
}
function correctOrders({db,body,user,list,save}){
 if(body.action==='previewMove')return previewCorrection(body,list);
 db.exec('BEGIN IMMEDIATE');try{const preview=previewCorrection(body,list);if(JSON.stringify(preview)!==body.expectedPreview)throw Error('Les données ont changé. Refaites la prévisualisation');if(!body.reason?.trim())throw Error('Motif obligatoire');if(!Array.isArray(body.selectedOrders)||!body.selectedOrders.length||new Set(body.selectedOrders).size!==body.selectedOrders.length||body.selectedOrders.some(n=>!preview.orders.some(o=>o.number===n&&!o.errors.length)))throw Error('Sélectionnez uniquement les commandes sans erreur');
 const selected=preview.orders.filter(o=>body.selectedOrders.includes(o.number));let target=list('jumiaStores').find(s=>s.id===body.targetStoreId);const listings=[...(target.listings||[])];for(const item of selected){const order=list('jumiaOrders').find(o=>o.id===item.orderId);for(const line of order.lines){const existing=listings.find(l=>l.sku===line.sku);if(existing&&(existing.productId||null)!==(line.productId||null))throw Error('Produits incompatibles pour le SKU '+line.sku);if(!existing)listings.push({sku:line.sku,jumiaSku:line.jumiaSku||'',productId:line.productId||null,name:line.name,salePrice:line.salePrice,commissionPercent:line.commissionPercent,shippingFee:line.shippingContribution,active:true});}}
 if(listings.length!==(target.listings||[]).length){handleJumia({db,body:{...target,listings,expectedRecord:JSON.stringify(target),reason:body.reason},user,list,save,kind:'jumiaStores',outerTransaction:true});target=list('jumiaStores').find(s=>s.id===target.id);}
 for(const item of selected){const old=list('jumiaOrders').find(o=>o.id===item.orderId),now=new Date().toISOString(),updated={...old,storeId:target.id,storeName:target.name,lines:old.lines.map(l=>({...l,listingId:target.listings.find(t=>t.sku===l.sku).id})),updatedAt:now,updatedBy:user.name,history:[...(old.history||[]),{at:now,by:user.name,reason:body.reason+' — '+preview.sourceName+' → '+preview.targetName,statuses:old.lines.map(l=>({lineId:l.lineId,name:l.name,status:l.status}))}]};save('jumiaOrders',updated,old.id);auditRecord(db,'jumiaOrders',old,updated,user,'Modification',body.reason+' — correction de boutique');}
 db.exec('COMMIT');return {moved:selected.length};}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={previewCorrection,correctOrders};
