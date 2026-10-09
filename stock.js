function stockBreakdown(product,movements,documents,inventories=[],jumiaOrders=[]){
 const purchased=movements.filter(m=>m.active!==false&&m.status!=='pending').reduce((sum,m)=>sum+(m.lines||[m]).filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0),0);
 const sold=documents.filter(d=>d.active!==false&&d.type==='Facture').reduce((sum,d)=>sum+d.lines.filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0),0);
 const jumiaSold=jumiaOrders.flatMap(order=>require('./public/jumia-math').jumiaStockLines(order)).filter(([id])=>id===product.id).reduce((sum,[,qty])=>sum-qty,0);
 const adjustment=inventories.filter(i=>i.active!==false&&i.productId===product.id).reduce((sum,i)=>sum+i.delta,0);
 const initialStock=product.initialStock??product.stock-purchased+sold+jumiaSold-adjustment;
 return {...product,initialStock,purchased,sold,jumiaSold,adjustment,stock:initialStock+purchased-sold-jumiaSold+adjustment};
}
function initializeStock(db){
 const rows=kind=>db.prepare('SELECT id,data FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
 const movements=rows('movements'),documents=rows('documents'),inventories=rows('inventories'),jumiaOrders=rows('jumiaOrders');db.exec('BEGIN IMMEDIATE');try{
 for(const p of rows('products'))if(p.initialStock===undefined){const {initialStock}=stockBreakdown(p,movements,documents,inventories,jumiaOrders);db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...p,initialStock}),p.id);}
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={stockBreakdown,initializeStock};
