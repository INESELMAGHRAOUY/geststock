const crypto=require('node:crypto');const {auditRecord}=require('./record-admin');const {jumiaStatuses,jumiaStockLines}=require('./public/jumia-math');
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const money=(v,name,nullable=false)=>{if(nullable&&(v===null||v===''||v===undefined))return null;if(!Number.isFinite(v)||v<0||!Number.isSafeInteger(Math.round(v*100))||Math.abs(v*100-Math.round(v*100))>0.00001)throw Error(name+' invalide');return v;};
function handleJumia({db,body,user,list,save,kind}){
 db.exec('BEGIN IMMEDIATE');try{
 if(body.action==='ready')body.reason='Commande prête à expédier';
 const old=body.id!==undefined?list(kind).find(o=>o.id===body.id):null;if(body.id!==undefined&&!old)throw Error('Élément Jumia introuvable');
 if(old){if(user.role!=='admin')throw Error('Modification réservée aux administrateurs');if(JSON.stringify(old)!==body.expectedRecord)throw Error('Cet élément a changé. Rouvrez le formulaire');if(!body.reason?.trim())throw Error('Motif obligatoire');}
 let updated;
 if(body.action==='ready'){
 if(kind!=='jumiaOrders'||!old||old.active===false||!old.lines.some(l=>l.status==='En attente'))throw Error('Aucune ligne en attente à préparer');
 updated={...old,lines:old.lines.map(l=>l.status==='En attente'?{...l,status:'Prêt à expédier'}:l)};
 }else if(body.action==='setActive'){
 if(!old||typeof body.active!=='boolean'||body.active===(old.active!==false))throw Error('État invalide');updated={...old,active:body.active};
 }else if(kind==='jumiaHubs'){
 if(user.role!=='admin')throw Error('Gestion des hubs réservée aux administrateurs');
 if(typeof body.name!=='string'||!body.name.trim()||typeof body.city!=='string'||!body.city.trim())throw Error('Nom et ville du hub obligatoires');
 for(const key of ['address','phone','contact'])if(body[key]!==undefined&&typeof body[key]!=='string')throw Error('Coordonnées du hub invalides');
 if(list(kind).some(h=>h.id!==old?.id&&h.name.toLowerCase()===body.name.trim().toLowerCase()&&h.city.toLowerCase()===body.city.trim().toLowerCase()))throw Error('Ce hub existe déjà dans cette ville');
 updated={name:body.name.trim(),city:body.city.trim(),address:String(body.address||''),phone:String(body.phone||''),contact:String(body.contact||''),active:old?.active!==false};
 }else if(kind==='jumiaStores'){
 if(user.role!=='admin')throw Error('Gestion des stores réservée aux administrateurs');if(typeof body.name!=='string'||!body.name.trim())throw Error('Nom de boutique obligatoire');
 if(list(kind).some(s=>s.id!==old?.id&&s.name.toLowerCase()===body.name.trim().toLowerCase()))throw Error('Cette boutique existe déjà');
 const defaults={};for(const key of ['ticketUnitPrice','saltUnitPrice','cartonUnitPrice','supplierTransport','hubTransport'])defaults[key]=money(body.defaults?.[key]??old?.defaults?.[key]??0,key);
 const commissionPercent=body.commissionPercent??0;if(!Number.isFinite(commissionPercent)||commissionPercent<0||commissionPercent>100)throw Error('Commission invalide');
 updated={name:body.name.trim(),commissionPercent,defaults,active:old?.active!==false};
 }else{
 const store=list('jumiaStores').find(s=>s.id===body.storeId&&(s.active!==false||s.id===old?.storeId));if(!store||typeof body.number!=='string'||!body.number.trim()||!validDate(body.date))throw Error('Boutique, numéro et date obligatoires');
 if(list(kind).some(o=>o.id!==old?.id&&o.storeId===body.storeId&&o.number===body.number.trim()))throw Error('Ce numéro de commande existe déjà dans cette boutique');
 if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>200)throw Error('Ajoutez des produits à la commande');
 const seen=new Set();const lines=body.lines.map(l=>{
 const prior=old?.lines.find(p=>p.lineId===l.lineId);const product=l.productId?list('products').find(p=>p.id===l.productId):null;
 if(!product||product.active===false)throw Error('Enregistrez cet article et son achat dans le stock avant la commande Jumia');
 const name=String(l.name||product?.name||'').trim();if(!name||!Number.isSafeInteger(l.qty)||l.qty<=0||!jumiaStatuses.includes(l.status))throw Error('Produit, quantité ou statut invalide');
 const percent=l.commissionPercent??store.commissionPercent;if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Commission invalide');
 if(l.supplierId&&!list('suppliers').some(s=>s.id===l.supplierId))throw Error('Fournisseur introuvable');
 const lineId=prior?.lineId||crypto.randomUUID();if(seen.has(lineId))throw Error('Ligne dupliquée');seen.add(lineId);
 const dispatched=!!prior?.dispatched||['Expédié','Livré','La livraison a échoué','Retourné'].includes(l.status);
 if(l.returnedToStock&&(!dispatched||l.status==='Livré'))throw Error('Le retour physique au stock ne concerne pas un article livré');
 if(l.lost&&l.returnedToStock)throw Error('Un article perdu ne peut pas être remis en stock');
 return {lineId,productId:product?.id||null,name,sku:String(product.sku||''),jumiaSku:String(l.jumiaSku||''),supplierId:l.supplierId||null,qty:l.qty,purchasePrice:money(l.purchasePrice,'Prix achat'),salePrice:money(l.salePrice,'Prix vente'),status:l.status,fromStock:true,dispatched,returnedToStock:!!l.returnedToStock,lost:!!l.lost,commissionPercent:percent,commissionActual:money(l.commissionActual,'Commission prélevée',true),shippingContribution:money(l.shippingContribution??0,'Contribution livraison'),otherFees:money(l.otherFees??0,'Autres frais'),refundCredit:money(l.refundCredit??0,'Remboursement Jumia')};
 });
 const hub=body.hubId?list('jumiaHubs').find(h=>h.id===body.hubId&&(h.active!==false||h.id===old?.hubId)):null;if(body.hubId&&!hub)throw Error('Hub indisponible');
 const costs={};for(const key of ['supplierTransport','hubTransport','ticketUnitPrice','saltUnitPrice','cartonUnitPrice','other'])costs[key]=money(body.costs?.[key]??0,key);
 for(const key of ['ticketQty','cartonQty','saltKg']){const value=body.costs?.[key]??0;if(!Number.isFinite(value)||value<0||(key!=='saltKg'&&!Number.isSafeInteger(value)))throw Error('Quantité emballage invalide');costs[key]=value;}
 updated={storeId:store.id,storeName:store.name,hubId:hub?.id||null,hubName:hub?.name||'',hubCity:hub?.city||'',hubAddress:hub?.address||'',number:body.number.trim(),date:body.date,customer:String(body.customer||''),address:String(body.address||''),paymentMethod:String(body.paymentMethod||'À la livraison'),shippingMethod:String(body.shippingMethod||'Dropshipping'),tracking:String(body.tracking||''),notes:String(body.notes||''),lines,costs,active:old?.active!==false};
 }
 if(kind==='jumiaOrders'){
 const delta=new Map();for(const [id,q] of jumiaStockLines(old||{lines:[]}))delta.set(id,(delta.get(id)||0)-q);for(const [id,q] of jumiaStockLines(updated))delta.set(id,(delta.get(id)||0)+q);
 for(const [id,q] of delta){const product=list('products').find(p=>p.id===id);if(!product||product.stock+q<0)throw Error('Stock insuffisant : '+(product?.name||id));}
 updated.history=[...(old?.history||[]),{at:new Date().toISOString(),by:user.name,reason:body.reason||'Commande saisie',statuses:updated.lines.map(l=>({lineId:l.lineId,name:l.name,status:l.status}))}];
 }
 updated.createdAt=old?.createdAt||new Date().toISOString();updated.createdBy=old?.createdBy||user.name;updated.updatedAt=new Date().toISOString();updated.updatedBy=user.name;
 const id=save(kind,updated,old?.id);if(old)auditRecord(db,kind,old,{...updated,id},user,body.action==='setActive'?(updated.active?'Réactivation':'Désactivation'):'Modification',body.reason);db.exec('COMMIT');return {id};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={handleJumia};
