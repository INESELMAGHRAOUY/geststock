function stockBreakdown(product,movements,documents){
 const purchased=movements.filter(m=>m.active!==false&&m.productId===product.id).reduce((sum,m)=>sum+m.qty,0);
 const sold=documents.filter(d=>d.active!==false&&d.type==='Facture').reduce((sum,d)=>sum+d.lines.filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0),0);
 const initialStock=product.initialStock??product.stock-purchased+sold;
 return {...product,initialStock,purchased,sold,stock:initialStock+purchased-sold};
}
function initializeStock(db){
 const rows=kind=>db.prepare('SELECT id,data FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
 const movements=rows('movements'),documents=rows('documents');db.exec('BEGIN IMMEDIATE');try{
 for(const p of rows('products'))if(p.initialStock===undefined){const {initialStock}=stockBreakdown(p,movements,documents);db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...p,initialStock}),p.id);}
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={stockBreakdown,initializeStock};
