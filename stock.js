function latestPurchaseCost(product,movements){
 const receipts=movements.filter(m=>m.active!==false&&m.status!=='pending'&&(m.lines||[m]).some(l=>l.productId===product.id&&Number.isFinite(l.unitPrice))).sort((a,b)=>String(b.receivedAt||b.date||'').localeCompare(String(a.receivedAt||a.date||''))||(b.id||0)-(a.id||0));
 const receipt=receipts[0];if(!receipt)return {lastPurchasePrice:product.purchasePrice??0,purchaseSourceId:null};
 const lines=(receipt.lines||[receipt]).filter(l=>l.productId===product.id&&Number.isFinite(l.unitPrice));const qty=lines.reduce((n,l)=>n+l.qty,0),total=lines.reduce((n,l)=>n+(l.total??l.qty*l.unitPrice*(1-(l.discount||0)/100)),0);
 return {lastPurchasePrice:Math.round(total/qty*100)/100,purchaseSourceId:receipt.id,purchaseSourceReference:receipt.reference||'#'+receipt.id};
}
function stockBreakdown(product,movements,documents,inventories=[],jumiaOrders=[],delegatePurchases=[]){
 const purchased=movements.filter(m=>m.active!==false&&m.status!=='pending').reduce((sum,m)=>sum+(m.lines||[m]).filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0),0);
 const sold=documents.filter(d=>d.active!==false&&d.type==='Facture').reduce((sum,d)=>sum+d.lines.filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0),0);
 const jumiaSold=jumiaOrders.flatMap(order=>require('./public/jumia-math').jumiaStockLines(order)).filter(([id])=>id===product.id).reduce((sum,[,qty])=>sum-qty,0);
 const delegateSupplied=delegatePurchases.filter(p=>p.active!==false&&p.source==='company'&&p.status==='received').flatMap(p=>p.lines).filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0);
 const adjustment=inventories.filter(i=>i.active!==false&&i.productId===product.id).reduce((sum,i)=>sum+i.delta,0);
 const initialStock=product.initialStock??product.stock-purchased+sold+jumiaSold+delegateSupplied-adjustment;
 return {...product,...latestPurchaseCost(product,movements),initialStock,purchased,sold,jumiaSold,delegateSupplied,adjustment,stock:initialStock+purchased-sold-jumiaSold-delegateSupplied+adjustment};
}
// Index operations once for the catalogue instead of scanning every operation per article.
function catalogueStock(products,movements,documents,inventories=[],jumiaOrders=[],delegatePurchases=[]){
 const index=(rows,ids)=>{const map=new Map();for(const row of rows)for(const id of new Set(ids(row))){if(!map.has(id))map.set(id,[]);map.get(id).push(row);}return map;};
 const lineIds=row=>(row.lines||[row]).map(line=>line.productId);
 const receipts=index(movements,lineIds),sales=index(documents,lineIds),counts=index(inventories,row=>[row.productId]),delegates=index(delegatePurchases,lineIds);
 const {jumiaStockLines}=require('./public/jumia-math');
 const orders=index(jumiaOrders,row=>jumiaStockLines(row).map(([id])=>id));
 return products.map(p=>stockBreakdown(p,receipts.get(p.id)||[],sales.get(p.id)||[],counts.get(p.id)||[],orders.get(p.id)||[],delegates.get(p.id)||[]));
}
function initializeStock(db){
 const rows=kind=>db.prepare('SELECT id,data FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
 const movements=rows('movements'),documents=rows('documents'),inventories=rows('inventories'),jumiaOrders=rows('jumiaOrders');db.exec('BEGIN IMMEDIATE');try{
 for(const p of rows('products'))if(p.initialStock===undefined){const {initialStock}=stockBreakdown(p,movements,documents,inventories,jumiaOrders,rows('delegatePurchases'));db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...p,initialStock}),p.id);}
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={stockBreakdown,catalogueStock,initializeStock,latestPurchaseCost};
