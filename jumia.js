const {parseJumiaCSV,parseCSV}=require('./public/jumia-import');
const crypto=require('node:crypto');const {auditRecord}=require('./record-admin');const {jumiaStatuses,jumiaStockLines}=require('./public/jumia-math');
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const money=(v,name,nullable=false)=>{if(nullable&&(v===null||v===''||v===undefined))return null;if(!Number.isFinite(v)||v<0||!Number.isSafeInteger(Math.round(v*100))||Math.abs(v*100-Math.round(v*100))>0.00001)throw Error(name+' invalide');return v;};
function handleJumia({db,body,user,list,save,kind,outerTransaction=false,allowStockShortage=false}){
 if(!outerTransaction)db.exec('BEGIN IMMEDIATE');try{
 if(kind==='jumiaCategories'&&body.action==='import'){
 if(user.role!=='admin')throw Error('Import réservé aux administrateurs');const rows=parseCSV(body.csv,2*1024*1024,10000,';');if(!('CATEGORIES' in rows[0]))throw Error('Colonne CATEGORIES attendue');const categories=list(kind),seen=new Set();let created=0,updated=0;
 for(const row of rows){const match=row.CATEGORIES.match(/^(\d+)\s*-\s*(.+)$/);if(!match)throw Error('Catégorie invalide : code - chemin attendu');const [,code,name]=match;if(seen.has(code))throw Error('Code catégorie dupliqué dans le CSV');seen.add(code);const old=categories.find(c=>c.code===code||(!c.code&&c.name.toLowerCase()===name.toLowerCase()));const record={...(old||{}),code,name,active:old?.active!==false,updatedAt:new Date().toISOString(),updatedBy:user.name};const id=save(kind,record,old?.id);if(old){auditRecord(db,kind,old,{...record,id},user,'Modification','Import catégories Jumia');updated++;}else created++;}
 if(!outerTransaction)db.exec('COMMIT');return {created,updated,count:rows.length};
 }

 if(body.action==='delivery')body.reason='Résultat de livraison';
 if(body.action==='ready')body.reason='Commande prête à expédier';if(body.action==='ship')body.reason='Commande expédiée';
 const old=body.id!==undefined?list(kind).find(o=>o.id===body.id):null;if(body.id!==undefined&&!old)throw Error('Élément Jumia introuvable');
 if(old){if(user.role!=='admin')throw Error('Modification réservée aux administrateurs');if(JSON.stringify(old)!==body.expectedRecord)throw Error('Cet élément a changé. Rouvrez le formulaire');if(!body.reason?.trim())throw Error('Motif obligatoire');}
 let updated;
 if(body.action==='ready'){
 if(kind!=='jumiaOrders'||!old||old.active===false||!old.lines.some(l=>l.status==='En attente'))throw Error('Aucune ligne en attente à préparer');
 updated={...old,lines:old.lines.map(l=>l.status==='En attente'?{...l,status:'Prêt à expédier'}:l)};
 }else if(body.action==='ship'){
 if(kind!=='jumiaOrders'||!old||old.active===false||!old.lines.some(l=>l.status==='Prêt à expédier'))throw Error('Aucune ligne prête à expédier');
 updated={...old,lines:old.lines.map(l=>l.status==='Prêt à expédier'?{...l,status:'Expédié',dispatched:true,returnedToStock:false,purchasePrice:list('products').find(p=>p.id===l.productId)?.lastPurchasePrice??l.purchasePrice,purchaseSourceId:list('products').find(p=>p.id===l.productId)?.purchaseSourceId??l.purchaseSourceId??null}:l)};
 }else if(body.action==='delivery'){
 if(kind!=='jumiaOrders'||!old||old.active===false||!old.lines.some(l=>l.status==='Expédié'))throw Error('Aucune ligne expédiée à mettre à jour');
 const shipped=old.lines.filter(l=>l.status==='Expédié');
 if(!Array.isArray(body.results)||body.results.length!==shipped.length||new Set(body.results.map(r=>r.lineId)).size!==shipped.length||body.results.some(r=>!shipped.some(l=>l.lineId===r.lineId)||!['Livré','La livraison a échoué'].includes(r.status)))throw Error('Choisissez le résultat de chaque article expédié');
 updated={...old,lines:old.lines.map(l=>l.status==='Expédié'?{...l,status:body.results.find(r=>r.lineId===l.lineId).status,returnedToStock:body.results.find(r=>r.lineId===l.lineId).status==='La livraison a échoué'&&!l.lost}:l)};
 }else if(body.action==='setActive'){
 if(!old||typeof body.active!=='boolean'||body.active===(old.active!==false))throw Error('État invalide');updated={...old,active:body.active};
 }else if(kind==='jumiaReports'){
 if(old)throw Error('Un import ne peut pas être modifié');const store=list('jumiaStores').find(s=>s.id===body.storeId&&s.active!==false);if(!store)throw Error('Choisissez une boutique active');
 const transactions=parseJumiaCSV(body.csv);const existing=new Set(list(kind).filter(r=>r.active!==false&&r.storeId===store.id).flatMap(r=>r.transactions.map(t=>t['Transaction Number'])));if(transactions.some(t=>existing.has(t['Transaction Number'])))throw Error('Ce fichier contient des transactions déjà importées dans cette boutique');
 updated={storeId:store.id,storeName:store.name,fileName:String(body.fileName||'Export Jumia.csv').slice(0,200),transactions,active:true};
 }else if(kind==='jumiaCategories'){
 if(user.role!=='admin')throw Error('Gestion des catégories réservée aux administrateurs');if(typeof body.name!=='string'||!body.name.trim()||body.name.length>1000)throw Error('Nom de catégorie obligatoire');if(list(kind).some(c=>c.id!==old?.id&&c.name.toLowerCase()===body.name.trim().toLowerCase()))throw Error('Cette catégorie existe déjà');updated={code:old?.code||'',name:body.name.trim(),active:old?.active!==false};
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
 const listingSkus=new Set(),listingIds=new Set();const inputListings=body.listings??old?.listings??[];
 if(!Array.isArray(inputListings)||inputListings.length>5000)throw Error('Listings invalides');
 const listings=inputListings.map(l=>{const product=list('products').find(p=>p.id===l.productId);if(!product)throw Error('Produit du listing introuvable');const sku=String(l.sku||'').trim();if(!sku||listingSkus.has(sku.toLowerCase()))throw Error('SKU vendeur obligatoire et unique dans cette boutique');listingSkus.add(sku.toLowerCase());const prior=old?.listings?.find(p=>p.id===l.id);if(prior&&prior.productId!==product.id&&list('jumiaOrders').some(o=>o.storeId===old.id&&o.lines.some(line=>line.listingId===prior.id)))throw Error('Ce listing est utilisé dans des commandes. Créez un autre listing pour changer le produit');const brandId=Object.hasOwn(l,'brandId')?l.brandId:prior?.brandId??null;const brand=brandId?db.prepare('SELECT * FROM jumia_brands WHERE id=?').get(brandId):null;if(brandId&&(!brand||(!brand.active&&prior?.brandId!==brand.id)))throw Error('Brand indisponible');const categoryId=Object.hasOwn(l,'categoryId')?l.categoryId:prior?.categoryId??null;const category=categoryId?list('jumiaCategories').find(c=>c.id===categoryId&&(c.active!==false||prior?.categoryId===c.id)):null;if(categoryId&&!category)throw Error('Catégorie indisponible');const id=prior?.id||crypto.randomUUID();if(listingIds.has(id))throw Error('Listing dupliqué');listingIds.add(id);const listingCommission=l.commissionPercent??prior?.commissionPercent??product.jumiaCommissionPercent??commissionPercent;if(!Number.isFinite(listingCommission)||listingCommission<0||listingCommission>100)throw Error('Commission du listing invalide');return {catalogSid:l.catalogSid??prior?.catalogSid??'',brandId:brand?.id||null,brandName:brand?.name||'',brandCode:brand?.code||'',categoryId:category?.id||null,commissionPercent:listingCommission,shippingFee:money(l.shippingFee??prior?.shippingFee??6,'Frais shipping du listing'),id,productId:product.id,name:product.name,sku,jumiaSku:String(l.jumiaSku||''),salePriceHT:money(l.salePriceHT??prior?.salePriceHT??product.price??0,'Prix de vente HT du listing'),salePrice:money(l.salePrice??prior?.salePrice??product.price??0,'Prix de vente TTC du listing'),active:l.active!==false};});
 updated={name:body.name.trim(),commissionPercent,defaults,listings,active:old?.active!==false};
 }else{
 const store=list('jumiaStores').find(s=>s.id===body.storeId&&(s.active!==false||s.id===old?.storeId));if(!store||typeof body.number!=='string'||!body.number.trim()||!validDate(body.date))throw Error('Boutique, numéro et date obligatoires');
 if(list(kind).some(o=>o.id!==old?.id&&o.storeId===body.storeId&&o.number===body.number.trim()))throw Error('Ce numéro de commande existe déjà dans cette boutique');
 if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>200)throw Error('Ajoutez des produits à la commande');
 const seen=new Set();const lines=body.lines.map(l=>{
 const prior=old?.lines.find(p=>p.lineId===l.lineId);const product=l.productId?list('products').find(p=>p.id===l.productId):null;
 if(!product||product.active===false)throw Error('Enregistrez cet article et son achat dans le stock avant la commande Jumia');
 const listing=l.listingId?store.listings?.find(p=>p.id===l.listingId):null;
 if(l.listingId&&(!listing||listing.productId!==product.id||(listing.active===false&&prior?.listingId!==listing.id)))throw Error('Listing indisponible dans cette boutique');
 const name=String(l.name||product?.name||'').trim();if(!name||!Number.isSafeInteger(l.qty)||l.qty<=0||!jumiaStatuses.includes(l.status))throw Error('Produit, quantité ou statut invalide');
 const percent=l.commissionPercent??prior?.commissionPercent??listing?.commissionPercent??product.jumiaCommissionPercent??store.commissionPercent;if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Commission invalide');
 if(l.supplierId&&!list('suppliers').some(s=>s.id===l.supplierId))throw Error('Fournisseur introuvable');
 const lineId=prior?.lineId||crypto.randomUUID();if(seen.has(lineId))throw Error('Ligne dupliquée');seen.add(lineId);
 const dispatched=!!prior?.dispatched||['Expédié','Livré','La livraison a échoué','Retourné'].includes(l.status);
 if(l.returnedToStock&&(!dispatched||l.status==='Livré'))throw Error('Le retour physique au stock ne concerne pas un article livré');
 if(l.lost&&l.returnedToStock)throw Error('Un article perdu ne peut pas être remis en stock');
 return {lineId,productId:product?.id||null,name,listingId:listing?.id||null,sku:String(prior?.dispatched&&prior.listingId===l.listingId?prior.sku:listing?.sku??prior?.sku??l.sku??''),jumiaSku:String(listing?.jumiaSku||l.jumiaSku||''),supplierId:l.supplierId||null,qty:l.qty,purchasePrice:money(prior?.dispatched&&prior.productId===product.id?prior.purchasePrice:(product.lastPurchasePrice??product.purchasePrice??0),'Prix achat'),purchaseSourceId:prior?.dispatched&&prior.productId===product.id?prior.purchaseSourceId??null:product.purchaseSourceId??null,salePrice:money(l.salePrice,'Prix vente'),status:l.status,fromStock:true,dispatched,returnedToStock:l.status==='La livraison a échoué'&&!l.lost?true:!!l.returnedToStock,lost:!!l.lost,commissionPercent:percent,commissionActual:money(l.commissionActual,'Commission prélevée',true),shippingContribution:money(l.shippingContribution??prior?.shippingContribution??listing?.shippingFee??(listing?6:0),'Contribution livraison'),otherFees:money(l.otherFees??0,'Autres frais'),refundCredit:money(l.refundCredit??0,'Remboursement Jumia')};
 });
 const hub=body.hubId?list('jumiaHubs').find(h=>h.id===body.hubId&&(h.active!==false||h.id===old?.hubId)):null;if(body.hubId&&!hub)throw Error('Hub indisponible');
 const costs={};for(const key of ['supplierTransport','hubTransport','returnTransport','ticketUnitPrice','saltUnitPrice','cartonUnitPrice','other'])costs[key]=money(body.costs?.[key]??0,key);
 for(const key of ['ticketQty','cartonQty','saltKg']){const value=body.costs?.[key]??0;if(!Number.isFinite(value)||value<0||(key!=='saltKg'&&!Number.isSafeInteger(value)))throw Error('Quantité emballage invalide');costs[key]=value;}
 updated={storeId:store.id,storeName:store.name,hubId:hub?.id||null,hubName:hub?.name||'',hubCity:hub?.city||'',hubAddress:hub?.address||'',number:body.number.trim(),date:body.date,customer:String(body.customer||''),address:String(body.address||''),paymentMethod:String(body.paymentMethod||'À la livraison'),shippingMethod:String(body.shippingMethod||'Dropshipping'),tracking:String(body.tracking||''),notes:String(body.notes||''),lines,costs,active:old?.active!==false};
 }
 if(kind==='jumiaOrders'){
 if(updated.lines.some(l=>l.status==='La livraison a échoué')&&!old?.lines.some(l=>l.status==='La livraison a échoué'))updated.costs={...updated.costs,returnTransport:body.costs?.returnTransport>0?body.costs.returnTransport:20};
 const delta=new Map();for(const [id,q] of jumiaStockLines(old||{lines:[]}))delta.set(id,(delta.get(id)||0)-q);for(const [id,q] of jumiaStockLines(updated))delta.set(id,(delta.get(id)||0)+q);
 for(const [id,q] of delta){const product=list('products').find(p=>p.id===id);if(!product||(!allowStockShortage&&q<0&&product.stock+q<0))throw Error('Stock insuffisant : '+(product?.name||id));}
 updated.history=[...(old?.history||[]),{at:new Date().toISOString(),by:user.name,reason:body.reason||'Commande saisie',statuses:updated.lines.map(l=>({lineId:l.lineId,name:l.name,status:l.status}))}];
 }
 updated.createdAt=old?.createdAt||new Date().toISOString();updated.createdBy=old?.createdBy||user.name;updated.updatedAt=new Date().toISOString();updated.updatedBy=user.name;
 const id=save(kind,updated,old?.id);if(old)auditRecord(db,kind,old,{...updated,id},user,body.action==='setActive'?(updated.active?'Réactivation':'Désactivation'):'Modification',body.reason);if(!outerTransaction)db.exec('COMMIT');return {id};
 }catch(error){if(!outerTransaction)db.exec('ROLLBACK');throw error;}
}
module.exports={handleJumia};
