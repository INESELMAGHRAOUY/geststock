(function(root){
 const jumiaStatuses=['En attente','Prêt à expédier','Expédié','Livré','Annulé','La livraison a échoué','Retourné'];
 const cents=n=>Math.round(Number(n||0)*100);
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
 function jumiaCustomers(orders){const groups=new Map(),normal=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();for(const o of orders){if(o.active===false)continue;const key=o.customer?.trim()?JSON.stringify([normal(o.customer),normal(o.address)]):'unknown:'+o.id;const g=groups.get(key)||{key,name:o.customer?.trim()||'Client non renseigné',address:o.address||'',orders:[],amount:0,lastDate:'',returnedOrders:0,failedOrders:0,deliveredOrders:0,pendingOrders:0,cancelledOrders:0};g.orders.push(o);if(o.lines.some(l=>l.status==='Annulé'))g.cancelledOrders++;if(o.lines.some(l=>l.status==='En attente'))g.pendingOrders++;if(o.lines.some(l=>l.status==='Livré'))g.deliveredOrders++;if(o.lines.some(l=>l.status==='Retourné'))g.returnedOrders++;if(o.lines.some(l=>l.status==='La livraison a échoué'))g.failedOrders++;g.amount+=o.lines.filter(l=>l.status==='Livré').reduce((sum,l)=>sum+Math.round(l.salePrice*100)*l.qty,0);if(o.date>g.lastDate)g.lastDate=o.date;groups.set(key,g);}return [...groups.values()].sort((a,b)=>Number(b.pendingOrders>0)-Number(a.pendingOrders>0)||b.lastDate.localeCompare(a.lastDate));}
 function jumiaHubStats(orders,hubs=[]){
 const groups=new Map(),normalize=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
 for(const order of orders){
  const lines=(order.lines||[]).filter(l=>l.status!=='Annulé');if(!lines.length)continue;
  const hub=hubs.find(h=>h.id===order.hubId),name=hub?.name||order.hubName||'Hub non renseigné',city=hub?.city||order.hubCity||'';
  const key=order.hubId?'id:'+order.hubId:normalize(name+'|'+city),g=groups.get(key)||{key,name,city,identified:Boolean(order.hubId||order.hubName),orders:0,deposited:0,delivered:0,returned:0,failed:0,cancelled:0,inTransit:0};
  const has=status=>lines.some(l=>l.status===status);
  g.orders++;if(lines.some(l=>l.dispatched||['Expédié','Livré','Retourné','La livraison a échoué'].includes(l.status)))g.deposited++;
  if(has('Livré'))g.delivered++;if(has('Retourné'))g.returned++;if(has('La livraison a échoué'))g.failed++;if(has('Annulé'))g.cancelled++;if(has('Expédié'))g.inTransit++;
  groups.set(key,g);
 }
 const total=[...groups.values()].reduce((n,g)=>n+g.deposited,0);
 return [...groups.values()].map(g=>({...g,share:total?g.deposited/total*100:0,deliveryRate:g.deposited?g.delivered/g.deposited*100:null})).sort((a,b)=>b.deposited-a.deposited||b.orders-a.orders||a.name.localeCompare(b.name));
 }
 root.jumiaHubStats=jumiaHubStats;root.jumiaCustomers=jumiaCustomers;
 root.jumiaStatuses=jumiaStatuses;root.jumiaStockLines=jumiaStockLines;root.jumiaOrderTotals=jumiaOrderTotals;root.jumiaSummary=jumiaSummary;
 if(typeof module!=='undefined'&&module.exports)module.exports={jumiaHubStats,jumiaCustomers,jumiaStatuses,jumiaStockLines,jumiaOrderTotals,jumiaSummary};
})(globalThis);
