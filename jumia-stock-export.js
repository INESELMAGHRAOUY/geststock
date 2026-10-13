const {parseCSV}=require('./public/jumia-import');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cell=value=>/[",\r\n]/.test(String(value))?'"'+String(value).replaceAll('"','""')+'"':String(value);
function exportStock({store,listingIds,referenceCsv}){
 if(!Array.isArray(listingIds)||!listingIds.length||new Set(listingIds).size!==listingIds.length)throw Error('Sélectionnez les listings à exporter');
 const reference=new Map();
 if(referenceCsv){const rows=parseCSV(referenceCsv);if(['SELLER_SKU','PRODUCT_SID','STOCK','NAME'].some(k=>!(k in rows[0])))throw Error('Export stock Jumia attendu : SELLER_SKU,PRODUCT_SID,STOCK,NAME');for(const row of rows){if(!row.SELLER_SKU||!uuid.test(row.PRODUCT_SID)||reference.has(row.SELLER_SKU))throw Error('SKU ou PRODUCT_SID invalide / dupliqué dans le fichier stock');reference.set(row.SELLER_SKU,row);}}
 const seen=new Set(),rows=listingIds.map(id=>{const listing=store.listings.find(l=>l.id===id);if(!listing||listing.active===false)throw Error('Listing non autorisé ou inactif');if(!(listing.ownStock<=0))throw Error('Le stock a changé : '+listing.sku+' dispose encore de stock personnel');const sku=String(listing.sku||'').trim(),ref=reference.get(sku),sid=ref?.PRODUCT_SID||listing.catalogSid;if(!sku||seen.has(sku))throw Error('SKU vendeur absent ou dupliqué');seen.add(sku);if(!uuid.test(sid||''))throw Error('PRODUCT_SID manquant pour '+sku+' : chargez le fichier stock Jumia de cette boutique');if(ref&&listing.catalogSid&&ref.PRODUCT_SID!==listing.catalogSid)throw Error('Le fichier stock ne correspond pas au listing '+sku);return [sku,sid,0,ref?.NAME||listing.name||''];});
 return {count:rows.length,fileName:'rupture-stock-'+String(store.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100)+'.csv',csv:'SELLER_SKU,PRODUCT_SID,STOCK,NAME\n'+rows.map(row=>row.map(cell).join(',')).join('\n')+'\n'};
}
module.exports={exportStock};
