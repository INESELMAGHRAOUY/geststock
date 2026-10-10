const crypto=require('node:crypto');
const {auditRecord}=require('./record-admin');
const cents=n=>Math.round(Number(n||0)*100);
function previewReturns(existing,lines){
 const requests=lines.filter(l=>l.status==='Retourné');if(!requests.length)return {returns:[],errors:[]};
 if(!existing||existing.active===false)return {returns:[],errors:['Commande d’origine active introuvable : enregistrez-la avant son retour']};
 const returns=[],errors=[];
 for(const request of requests){const matches=existing.lines.filter(l=>l.sku===request.sku&&cents(l.salePrice)===cents(request.salePrice));const already=matches.filter(l=>l.status==='Retourné'&&l.returnConfirmed).reduce((s,l)=>s+l.qty,0),qty=request.qty-already;if(qty<=0)continue;
 const eligible=matches.filter(l=>l.status==='Livré'),available=eligible.reduce((s,l)=>s+l.qty,0);if(qty>available){errors.push(request.sku+' : quantité retournée supérieure aux articles livrés rapprochés');continue;}
 let remaining=qty;const parts=[];for(const line of eligible){const take=Math.min(remaining,line.qty);if(take)parts.push({lineId:line.lineId,qty:take});remaining-=take;}
 returns.push({key:JSON.stringify([existing.number,request.sku,request.salePrice]),sku:request.sku,name:request.name,qty,parts,purchaseCost:parts.reduce((sum,p)=>sum+cents(eligible.find(l=>l.lineId===p.lineId).purchasePrice)*p.qty,0)/100});
 }
 return {returns,errors,original:JSON.stringify(existing)};
}
function applyReturns({db,item,body,user,list,save}){
 const old=list('jumiaOrders').find(o=>o.storeId===body.storeId&&o.number===item.number);if(!old||JSON.stringify(old)!==item.original)throw Error('La commande a changé. Refaites la prévisualisation');
 let lines=structuredClone(old.lines);for(const plan of item.returns){const decision=body.returnDecisions?.[plan.key];if(!decision||!['usable','damaged'].includes(decision.condition))throw Error('Confirmez l’état de chaque produit retourné');const amount=decision.compensation;if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(cents(amount))||Math.abs(amount*100-cents(amount))>0.00001)throw Error('Indemnisation Jumia invalide');let compensationLeft=cents(amount),allocatedQty=0;
 for(let i=0;i<plan.parts.length;i++){const part=plan.parts[i],index=lines.findIndex(l=>l.lineId===part.lineId),prior=lines[index];if(!prior||prior.status!=='Livré'||part.qty>prior.qty)throw Error('Retour non rapproché');const returned={...prior,lineId:part.qty===prior.qty?prior.lineId:crypto.randomUUID(),qty:part.qty,status:'Retourné',returnedToStock:decision.condition==='usable',lost:decision.condition==='damaged',returnConfirmed:true,returnCondition:decision.condition,returnConfirmedAt:new Date().toISOString(),returnConfirmedBy:user.name};allocatedQty+=part.qty;const compensation=i===plan.parts.length-1?compensationLeft:Math.round(cents(amount)*allocatedQty/plan.qty)-(cents(amount)-compensationLeft);returned.returnCompensation=compensation/100;compensationLeft-=compensation;
 // Keep already incurred fees and allocate total fields when only some units return.
 const remainder={...prior,qty:prior.qty-part.qty};for(const key of ['commissionActual','otherFees','refundCredit']){if(prior[key]===null||prior[key]===undefined)continue;const total=cents(prior[key]),share=Math.round(total*part.qty/prior.qty);returned[key]=share/100;remainder[key]=(total-share)/100;}
 if(prior.commissionActual===null||prior.commissionActual===undefined){returned.commissionActual=Math.round(cents(prior.salePrice)*part.qty*prior.commissionPercent/100)/100;}
 lines.splice(index,1,...(remainder.qty?[remainder,returned]:[returned]));
 }}
 const now=new Date().toISOString(),updated={...old,lines,updatedAt:now,updatedBy:user.name,history:[...(old.history||[]),{at:now,by:user.name,reason:'Retour client confirmé depuis export Jumia',statuses:lines.map(l=>({lineId:l.lineId,name:l.name,status:l.status}))}]};save('jumiaOrders',updated,old.id);auditRecord(db,'jumiaOrders',old,updated,user,'Modification','Retour client : état et indemnisation confirmés');
}
module.exports={previewReturns,applyReturns};
