(function(root){
 const jumiaStatuses=['En attente','Prêt à expédier','Expédié','Livré','Annulé','La livraison a échoué','Retourné'];
 const cents=n=>Math.round(Number(n||0)*100);
 function isOutOfStockCancellation(line){return line.status==='Annulé'&&/out[\s_-]*of[\s_-]*stock/i.test(line.cancelReason||'');}
 function cancellationOnClient(order,line){return line.status==='Annulé'&&(typeof order.cancellationOnClient==='boolean'?order.cancellationOnClient:!isOutOfStockCancellation(line));}
 function matchesJumiaStatus(order,status){return !status||order.lines.some(l=>status==='Out of stock'?isOutOfStockCancellation(l):status==='Annulé'?l.status==='Annulé'&&!isOutOfStockCancellation(l):l.status===status);}
 function jumiaStockLines(order){if(order.active===false)return [];return order.lines.filter(l=>l.productId&&l.fromStock&&l.dispatched&&!l.returnedToStock&&!(l.status==='La livraison a échoué'&&!l.lost)).map(l=>[l.productId,-l.qty]);}
 function jumiaOrderTotals(order){
 let revenue=0,productCost=0,marketplaceFees=0,forecast=0,returnCompensation=0;
 for(const l of order.lines){if(l.status==='Annulé'&&!l.dispatched)continue;const gross=cents(l.salePrice)*l.qty,buy=cents(l.purchasePrice)*l.qty,fees=l.commissionActual!==null&&l.commissionActual!==undefined?cents(l.commissionActual):(l.status==='Livré'?Math.round(gross*l.commissionPercent/100):0);
 if(l.status==='Retourné')returnCompensation+=cents(l.returnCompensation);
 if(l.status==='Livré'){revenue+=gross;productCost+=buy;}else if(l.lost)productCost+=buy;
 marketplaceFees+=fees+cents(l.shippingContribution)*l.qty+cents(l.otherFees)-cents(l.refundCredit);
 if(!['Annulé','Retourné','La livraison a échoué'].includes(l.status))forecast+=gross-buy-(l.commissionActual!==null&&l.commissionActual!==undefined?cents(l.commissionActual):Math.round(gross*l.commissionPercent/100))-cents(l.shippingContribution)*l.qty-cents(l.otherFees)+cents(l.refundCredit);
 }
 const c=order.costs||{},failed=order.lines.some(l=>['La livraison a échoué','Retourné'].includes(l.status)),allFailed=order.lines.length>0&&order.lines.every(l=>['La livraison a échoué','Retourné'].includes(l.status)),logistics=order.lines.length>0&&order.lines.every(l=>l.status==='Annulé'&&!l.dispatched)?0:cents(c.returnTransport??(failed?20:0))+cents(c.supplierTransport)+cents(c.hubTransport)+Math.round(c.ticketQty*cents(c.ticketUnitPrice))+(allFailed?0:Math.round((c.saltKg||0)*cents(c.saltUnitPrice)))+Math.round(c.cartonQty*cents(c.cartonUnitPrice))+cents(c.other);
 return {revenue,productCost,marketplaceFees,logistics,returnCompensation,netJumia:revenue-marketplaceFees+returnCompensation,profit:revenue-marketplaceFees+returnCompensation-productCost-logistics,forecast:forecast+returnCompensation-logistics};
 }
 function jumiaSummary(orders){return orders.filter(o=>o.active!==false).reduce((s,o)=>{const t=jumiaOrderTotals(o);for(const key of Object.keys(t))s[key]+=t[key];s.count++;return s;},{returnCompensation:0,revenue:0,productCost:0,marketplaceFees:0,logistics:0,netJumia:0,profit:0,forecast:0,count:0});}
 function jumiaCustomers(orders){const groups=new Map(),normal=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();for(const o of orders){if(o.active===false)continue;const key=o.customer?.trim()?JSON.stringify([normal(o.customer),normal(o.address)]):'unknown:'+o.id;const g=groups.get(key)||{key,name:o.customer?.trim()||'Client non renseigné',address:o.address||'',orders:[],amount:0,lastDate:'',returnedOrders:0,failedOrders:0,deliveredOrders:0,pendingOrders:0,shippedOrders:0,cancelledOrders:0,sellerCancelledOrders:0};g.orders.push(o);if(o.lines.some(l=>cancellationOnClient(o,l)))g.cancelledOrders++;if(o.lines.some(l=>l.status==='Annulé'&&!cancellationOnClient(o,l)))g.sellerCancelledOrders++;if(o.lines.some(l=>l.status==='En attente'))g.pendingOrders++;if(o.lines.some(l=>l.status==='Expédié'))g.shippedOrders++;if(o.lines.some(l=>l.status==='Livré'))g.deliveredOrders++;if(o.lines.some(l=>l.status==='Retourné'))g.returnedOrders++;if(o.lines.some(l=>l.status==='La livraison a échoué'))g.failedOrders++;g.amount+=o.lines.filter(l=>l.status==='Livré').reduce((sum,l)=>sum+Math.round(l.salePrice*100)*l.qty,0);if(o.date>g.lastDate)g.lastDate=o.date;groups.set(key,g);}return [...groups.values()].sort((a,b)=>Number(b.pendingOrders>0)-Number(a.pendingOrders>0)||b.lastDate.localeCompare(a.lastDate));}
 root.isOutOfStockCancellation=isOutOfStockCancellation;root.cancellationOnClient=cancellationOnClient;root.matchesJumiaStatus=matchesJumiaStatus;
 root.jumiaCustomers=jumiaCustomers;
 root.jumiaStatuses=jumiaStatuses;root.jumiaStockLines=jumiaStockLines;root.jumiaOrderTotals=jumiaOrderTotals;root.jumiaSummary=jumiaSummary;
 if(typeof module!=='undefined'&&module.exports)module.exports={isOutOfStockCancellation,cancellationOnClient,matchesJumiaStatus,jumiaCustomers,jumiaStatuses,jumiaStockLines,jumiaOrderTotals,jumiaSummary};
})(globalThis);
