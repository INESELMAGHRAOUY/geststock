const modes={cash:{type:'Facture',label:'Espèce',method:'Espèces'},credit:{type:'Facture',label:'Crédit'},card:{type:'Facture',label:'TPE',method:'Carte'},cheque:{type:'Facture',label:'Chèque',method:'Chèque'},quote:{type:'Devis',label:'Devis'},returnCash:{type:'Retour',label:'Retour Espèce',method:'Espèces',refund:true},returnCredit:{type:'Retour',label:'Retour Crédit'}};
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
function normalizeClientOperation(body,list){
 const explicit=body.operationMode!==undefined,mode=explicit?body.operationMode:body.type==='Retour'?'returnCredit':body.type==='Devis'?'quote':body.type==='Facture'?'credit':'';
 const spec=modes[mode];if(!spec)throw Error('Choisissez un type d’opération valide');
 if(explicit&&!list('clients').some(c=>c.id===body.clientId&&c.active!==false))throw Error('Choisissez un client actif');
 const bank=['card','cheque'].includes(mode)?list('banks').find(b=>b.id===body.bankId&&b.active!==false):null;
 if(['card','cheque'].includes(mode)&&!bank)throw Error('Choisissez le compte bancaire d’encaissement');
 const chequeNumber=mode==='cheque'?String(body.chequeNumber||'').trim():'';
 if(mode==='cheque'&&(!chequeNumber||chequeNumber.length>120||!validDate(body.chequeDueDate)))throw Error('Numéro et échéance du chèque obligatoires');
 return {mode,...spec,fields:{operationMode:mode,operationLabel:spec.label,type:spec.type,bankId:bank?.id||null,chequeNumber,chequeDueDate:mode==='cheque'?body.chequeDueDate:''},bank};
}
function clientOperationFingerprint(d){return JSON.stringify([d.type,d.operationMode||(d.type==='Retour'?'returnCredit':d.type==='Devis'?'quote':'credit'),d.clientId||0,d.tax,d.lines,d.bankId||null,d.chequeNumber||'',d.chequeDueDate||'']);}
function createClientOperationPayment({operation,document,id,user,save}){
 const amountCents=Math.round(document.total*100);if(!operation.method||!amountCents)return null;
 const at=new Date().toISOString(),date=document.date.slice(0,10),refund=!!operation.refund;
 return save('settlements',{side:'client',direction:refund?'out':'in',partyId:document.clientId||0,partyName:document.clientName,amount:amountCents/100,amountCents,date,method:operation.method,bankId:operation.bank?.id||null,bankName:operation.bank?.name||'',chequeNumber:document.chequeNumber||'',chequeDueDate:document.chequeDueDate||'',status:operation.mode==='cheque'?'pending':'validated',reference:document.number,notes:refund?'Remboursement du retour client en espèces':'Règlement saisi avec l’opération client',allocations:[{billId:id,reference:document.number,amountCents:refund?-amountCents:amountCents}],sourceDocumentId:id,automaticOperation:true,active:true,createdBy:user.name,updatedBy:user.name,createdAt:at,updatedAt:at});
}
module.exports={normalizeClientOperation,clientOperationFingerprint,createClientOperationPayment};
