// Financial statements identify the seller; order exports do not necessarily do so.
function normalizeStoreIdentity(value){if(value===undefined||value===null||value==='')return '';if(typeof value!=='string')throw Error('ID boutique Jumia invalide');const id=value.trim().toUpperCase();if(id&&(!/^[A-Z]{2}[A-Z0-9]{2,30}$/.test(id)||/^PS\d{6}/.test(id)))throw Error('ID boutique Jumia invalide (exemple : MA11T62)');return id;}
function storeIdentity(store){return normalizeStoreIdentity(store.statementStoreId||'');}
function statementIdentity(number){return String(number||'').trim().toUpperCase().match(/^PS\d{6}([A-Z]{2}[A-Z0-9]{2,30})$/)?.[1]||'';}
function validateStoreIdentity(id,storeId,stores){id=normalizeStoreIdentity(id);if(id&&stores.some(s=>s.id!==storeId&&storeIdentity(s)===id))throw Error('Cet ID Jumia appartient déjà à une autre boutique');return id;}
function verifyStatementStore(transactions,store){const ids=new Set(transactions.map(t=>statementIdentity(t['Statement Number'])).filter(Boolean)),expected=storeIdentity(store);if(ids.size>1)throw Error('Import bloqué : le fichier contient plusieurs IDs de boutiques Jumia');if(ids.size){const actual=[...ids][0];if(!expected)throw Error('Renseignez l’ID Jumia de cette boutique dans Boutiques → Modifier avant import (ID du fichier : '+actual+')');if(actual!==expected)throw Error('Import bloqué : ID du fichier '+actual+' différent de l’ID de la boutique sélectionnée '+expected);if(transactions.some(t=>!statementIdentity(t['Statement Number'])))throw Error('Import bloqué : Statement Number manquant ou non reconnu sur certaines transactions');return actual;}if(expected)throw Error('Import bloqué : aucun Statement Number permettant de vérifier l’ID de la boutique');return '';}
function verifyOrderListings(rows,store,list){
 const skuKey=v=>String(v||'').trim().toUpperCase(),ownersBySku=new Map();
 for(const boutique of list('jumiaStores')){if(boutique.active===false)continue;for(const listing of boutique.listings||[]){if(listing.active===false)continue;const sku=skuKey(listing.jumiaSku);if(!sku)continue;const owners=ownersBySku.get(sku)||new Set();owners.add(boutique.id);ownersBySku.set(sku,owners);}}
 const orders=new Map(),unknown=new Set(),ambiguous=new Set();
 for(const row of rows){const number=String(row['Order Number']||'').trim(),sku=skuKey(row['Jumia Sku']||row['Jumia SKU']),owners=ownersBySku.get(sku),result=orders.get(number)||{matched:0,uncertain:0};
  if(!owners){result.uncertain++;if(sku)unknown.add(sku);}
  else if(!owners.has(store.id))throw Error('Import bloqué : commande '+number+', SKU Jumia '+sku+' présent dans les listings d’une autre boutique, pas dans la boutique sélectionnée');
  else if(owners.size>1){result.uncertain++;ambiguous.add(sku);}
  else result.matched++;
  orders.set(number,result);
 }
 return {listingVerifiedOrders:[...orders.values()].filter(o=>o.matched&&!o.uncertain).length,listingPartialOrders:[...orders.values()].filter(o=>o.matched&&o.uncertain).length,unknownJumiaSkus:[...unknown].sort(),ambiguousJumiaSkus:[...ambiguous].sort()};
}
function verifyOrderStore(rows,store,list){
 const listings=verifyOrderListings(rows,store,list),expected=storeIdentity(store);
 if(rows.some(r=>r['Statement Number']))verifyStatementStore(rows,store);
 const known=new Map();
 for(const report of list('jumiaReports')){if(report.active===false)continue;for(const t of report.transactions||[]){const id=statementIdentity(t['Statement Number']);if(!id||!t['Order No.'])continue;const key=String(t['Order No.']).trim(),ids=known.get(key)||new Set();ids.add(id);known.set(key,ids);}}
 const verified=new Set(),unverified=new Set();
 for(const r of rows){const number=String(r['Order Number']||'').trim(),ids=known.get(number);if(!ids){unverified.add(number);continue;}if(ids.size!==1||!expected||!ids.has(expected))throw Error('Import bloqué : la commande '+number+' est rattachée à un autre ID Jumia, ou l’ID de la boutique sélectionnée doit être renseigné');verified.add(number);}
 return {statementStoreId:expected,verifiedOrders:verified.size,unverifiedOrders:unverified.size,...listings};
}
module.exports={normalizeStoreIdentity,storeIdentity,statementIdentity,validateStoreIdentity,verifyStatementStore,verifyOrderListings,verifyOrderStore};
