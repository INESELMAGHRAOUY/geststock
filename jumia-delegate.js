const crypto=require('node:crypto');
const {handleJumia}=require('./jumia');
const isJumiaDelegate=user=>user?.role==='user'&&user.access_profile==='jumia_delegate';
function setupDelegateAccess(db){const columns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));if(!columns.has('access_profile'))db.exec("ALTER TABLE users ADD COLUMN access_profile TEXT NOT NULL DEFAULT 'full'");if(!columns.has('jumia_store_ids'))db.exec("ALTER TABLE users ADD COLUMN jumia_store_ids TEXT NOT NULL DEFAULT '[]'");}
function assignedStores(user){try{const ids=JSON.parse(user.jumia_store_ids||'[]');return Array.isArray(ids)?ids.filter(Number.isSafeInteger):[];}catch{return [];}}
const version=record=>crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
const pick=(record,keys)=>Object.fromEntries(keys.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));
function delegateState({user,list,kinds}){const ids=assignedStores(user),products=list('products').filter(p=>p.active!==false),productMap=new Map(products.map(p=>[p.id,p]));return {...Object.fromEntries(kinds.map(k=>[k,[]])),products:products.map(p=>({...pick(p,['id','name','barcode','sku','price','imageId','jumiaCommissionPercent']),available:p.stock>0})),jumiaStores:list('jumiaStores').filter(s=>s.active!==false&&ids.includes(s.id)).map(s=>({...pick(s,['id','name','commissionPercent']),version:version(s),listings:(s.listings||[]).map(l=>({...pick(l,['id','productId','name','sku','jumiaSku','salePriceHT','salePrice','commissionPercent','shippingFee','brandId','brandName','brandCode','categoryId','imageUrl','active']),available:!!productMap.get(l.productId)&&productMap.get(l.productId).stock>0}))})),jumiaOrders:list('jumiaOrders').filter(o=>o.active!==false&&ids.includes(o.storeId)).map(o=>({...pick(o,['id','storeId','storeName','number','date','customer','address','tracking','notes','paymentMethod','shippingMethod']),version:version(o),lines:o.lines.map(l=>pick(l,['lineId','listingId','productId','name','sku','jumiaSku','qty','salePrice','status']))})),jumiaCategories:list('jumiaCategories').filter(c=>c.active!==false).map(c=>pick(c,['id','name','code'])),currentUser:{id:user.id,name:user.name,username:user.username,role:'jumia_delegate',active:true,storeIds:ids},users:[],settings:{currency:'MAD'},recurringCharges:[],expenseLifecycleHistory:[],recordAudit:[]};}
function scopedStore(body,user,list){if(!isJumiaDelegate(user))throw Error('Compte délégué requis');const store=list('jumiaStores').find(s=>s.id===body.storeId&&s.active!==false&&assignedStores(user).includes(s.id));if(!store)throw Error('Boutique non autorisée');return store;}
function delegateMutation({db,body,user,list,save,kind}){
 if(!isJumiaDelegate(user))throw Error('Compte délégué requis');
 if(kind==='jumiaDelegateStores'){
 if(body.id!==undefined||body.action)throw Error('Création de boutique uniquement');
 db.exec('BEGIN IMMEDIATE');try{const result=handleJumia({db,body:{name:body.name,commissionPercent:body.commissionPercent??15,defaults:{supplierTransport:0,hubTransport:20,ticketUnitPrice:1,saltUnitPrice:2,cartonUnitPrice:2}},user:{...user,role:'admin'},list,save,kind:'jumiaStores',outerTransaction:true});const store=list('jumiaStores').find(s=>s.id===result.id);save('jumiaStores',{...store,delegateOwnerId:user.id},store.id);db.prepare('UPDATE users SET jumia_store_ids=? WHERE id=?').run(JSON.stringify([...assignedStores(user),store.id]),user.id);db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
 }
 const store=scopedStore(body,user,list);let payload,target;
 if(kind==='jumiaDelegateListings'){
 if(body.expectedVersion!==version(store))throw Error('Les listings ont changé. Actualisez la page');
 const input=body.listing;if(!input||typeof input!=='object')throw Error('Listing obligatoire');const prior=input.id?store.listings?.find(l=>l.id===input.id):null;if(input.id&&!prior)throw Error('Listing introuvable dans cette boutique');
 const data=pick(input,['productId','sku','jumiaSku','salePriceHT','salePrice','commissionPercent','shippingFee','brandId','categoryId','active']);
 if(data.active!==undefined&&typeof data.active!=='boolean')throw Error('État du listing invalide');
 if(data.productId&&!list('products').some(p=>p.id===data.productId&&p.active!==false))throw Error('Produit indisponible');
 const updated={...(prior||{}),...data};payload={...store,id:store.id,expectedRecord:JSON.stringify(store),reason:'Listing géré par délégué '+user.name,listings:prior?store.listings.map(l=>l.id===prior.id?updated:l):[...(store.listings||[]),updated]};target='jumiaStores';
 }else if(kind==='jumiaDelegateOrders'){
 const old=body.id!==undefined?list('jumiaOrders').find(o=>o.id===body.id&&o.storeId===store.id&&o.active!==false):null;if(body.id!==undefined&&!old)throw Error('Commande non autorisée');if(old&&body.expectedVersion!==version(old))throw Error('La commande a changé. Actualisez la page');
 if(body.action){if(!old||!['ready','ship','delivery'].includes(body.action))throw Error('Action non autorisée');payload={id:old.id,action:body.action,expectedRecord:JSON.stringify(old),results:body.results};}
 else{
 if(!Array.isArray(body.lines)||!body.lines.length)throw Error('Ajoutez un article');
 const ids=new Set();const lines=body.lines.map(input=>{const prior=input.lineId?old?.lines.find(l=>l.lineId===input.lineId):null;if(input.lineId&&!prior)throw Error('Ligne non autorisée');if(prior&&ids.has(prior.lineId))throw Error('Ligne dupliquée');if(prior)ids.add(prior.lineId);
 if(prior&&prior.status!=='En attente'){if(input.listingId!==prior.listingId||input.qty!==prior.qty||input.salePrice!==prior.salePrice)throw Error('Article déjà préparé : quantité et prix conservés');return {...prior};}
 const listing=store.listings?.find(l=>l.id===input.listingId&&l.active!==false);if(!listing)throw Error('Listing indisponible dans cette boutique');const product=list('products').find(p=>p.id===listing.productId&&p.active!==false);
 return {...(prior||{}),lineId:prior?.lineId,listingId:listing.id,productId:listing.productId||null,name:product?.name||listing.name,qty:input.qty,salePrice:input.salePrice,status:prior?.status||'En attente',commissionPercent:prior?.commissionPercent??listing.commissionPercent??store.commissionPercent??0,commissionActual:prior?.commissionActual??null,shippingContribution:prior?.shippingContribution??listing.shippingFee??6,otherFees:prior?.otherFees??0,refundCredit:prior?.refundCredit??0,returnCompensation:prior?.returnCompensation??0,supplierId:prior?.supplierId||null,returnedToStock:prior?.returnedToStock||false,lost:prior?.lost||false};});
 if(old?.lines.some(l=>l.status!=='En attente'&&!ids.has(l.lineId)))throw Error('Un article déjà préparé ne peut pas être retiré');
 const d=store.defaults||{};payload={...(old||{}),...pick(body,['number','date','customer','address','tracking','notes']),storeId:store.id,lines,costs:old?.costs||{supplierTransport:d.supplierTransport??0,hubTransport:d.hubTransport??20,returnTransport:0,ticketQty:1,ticketUnitPrice:d.ticketUnitPrice??1,saltKg:1,saltUnitPrice:d.saltUnitPrice??2,cartonQty:1,cartonUnitPrice:d.cartonUnitPrice??2,other:0},reason:'Commande gérée par délégué '+user.name};if(old){payload.id=old.id;payload.expectedRecord=JSON.stringify(old);}
 }target='jumiaOrders';
 }else throw Error('Module délégué inconnu');
 // Only these constructed, store-scoped payloads reach the existing admin-only handlers.
 return handleJumia({db,body:payload,user:{...user,role:'admin'},list,save,kind:target});
}
module.exports={setupDelegateAccess,isJumiaDelegate,assignedStores,delegateState,delegateMutation,version};
