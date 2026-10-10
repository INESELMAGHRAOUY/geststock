(function(root){
 const jumiaStatuses=['En attente','Prêt à expédier','Expédié','Livré','Annulé','La livraison a échoué','Retourné'];
 const cents=n=>Math.round(Number(n||0)*100);
 function jumiaStockLines(order){if(order.active===false)return [];return order.lines.filter(l=>l.fromStock&&l.dispatched&&!l.returnedToStock).map(l=>[l.productId,-l.qty]);}
 function jumiaOrderTotals(order){
 let revenue=0,productCost=0,marketplaceFees=0,forecast=0;
 for(const l of order.lines){const gross=cents(l.salePrice)*l.qty,buy=cents(l.purchasePrice)*l.qty,fees=l.commissionActual!==null&&l.commissionActual!==undefined?cents(l.commissionActual):(l.status==='Livré'?Math.round(gross*l.commissionPercent/100):0);
 if(l.status==='Livré'){revenue+=gross;productCost+=buy;}else if(l.lost)productCost+=buy;
 marketplaceFees+=fees+cents(l.shippingContribution)*l.qty+cents(l.otherFees)-cents(l.refundCredit);
 if(!['Annulé','Retourné','La livraison a échoué'].includes(l.status))forecast+=gross-buy-(l.commissionActual!==null&&l.commissionActual!==undefined?cents(l.commissionActual):Math.round(gross*l.commissionPercent/100))-cents(l.shippingContribution)*l.qty-cents(l.otherFees)+cents(l.refundCredit);
 }
 const c=order.costs||{},logistics=cents(c.supplierTransport)+cents(c.hubTransport)+Math.round(c.ticketQty*cents(c.ticketUnitPrice))+Math.round(c.saltKg*cents(c.saltUnitPrice))+Math.round(c.cartonQty*cents(c.cartonUnitPrice))+cents(c.other);
 return {revenue,productCost,marketplaceFees,logistics,netJumia:revenue-marketplaceFees,profit:revenue-marketplaceFees-productCost-logistics,forecast:forecast-logistics};
 }
 function jumiaSummary(orders){return orders.filter(o=>o.active!==false).reduce((s,o)=>{const t=jumiaOrderTotals(o);for(const key of Object.keys(t))s[key]+=t[key];s.count++;return s;},{revenue:0,productCost:0,marketplaceFees:0,logistics:0,netJumia:0,profit:0,forecast:0,count:0});}
 function jumiaCustomers(orders){const groups=new Map(),normal=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();for(const o of orders){if(o.active===false||!o.lines.some(l=>l.status==='Livré'))continue;const key=o.customer?.trim()?JSON.stringify([normal(o.customer),normal(o.address)]):'unknown:'+o.id;const g=groups.get(key)||{key,name:o.customer?.trim()||'Client non renseigné',address:o.address||'',orders:[],amount:0,lastDate:''};g.orders.push(o);g.amount+=o.lines.filter(l=>l.status==='Livré').reduce((sum,l)=>sum+Math.round(l.salePrice*100)*l.qty,0);if(o.date>g.lastDate)g.lastDate=o.date;groups.set(key,g);}return [...groups.values()].sort((a,b)=>b.lastDate.localeCompare(a.lastDate));}
 root.jumiaCustomers=jumiaCustomers;
 root.jumiaStatuses=jumiaStatuses;root.jumiaStockLines=jumiaStockLines;root.jumiaOrderTotals=jumiaOrderTotals;root.jumiaSummary=jumiaSummary;
 if(typeof module!=='undefined'&&module.exports)module.exports={jumiaCustomers,jumiaStatuses,jumiaStockLines,jumiaOrderTotals,jumiaSummary};
})(globalThis);
