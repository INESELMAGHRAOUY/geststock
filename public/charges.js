let editingRecurring=null,editingPayment=null,attachmentPayment=null,validationPayment=null,printPayment=null;
let chargeTab='entry',selectedExpense=null,chargeFilters={search:'',from:'',to:'',status:''};
function paymentIsPaid(p){return p.method!=='Chèque'||p.status==='validated';}
function expenseCommitted(expense){return state.expensePayments.filter(p=>p.expenseId===expense.id).reduce((sum,p)=>sum+p.amountCents,0);}
function expensePaid(expense){return state.expensePayments.filter(p=>p.expenseId===expense.id&&paymentIsPaid(p)).reduce((sum,p)=>sum+p.amountCents,0);}
function expenseStatus(expense){const paid=expensePaid(expense);return paid===0&&expenseCommitted(expense)>0?'Chèque en instance':paid===0?'Non payée':paid>=expense.amountCents?'Payée':'Partiellement payée';}
function chargeSupplierSelect(id){return `<label>Fournisseur<select name="supplierId">${options('suppliers','Facultatif')}</select></label>`.replace(`value="${id}"`,`value="${id}" selected`);}
function chargeDate(){return new Date().toISOString().slice(0,10);}
function renderCharges(){
 const total=state.expenses.reduce((s,x)=>s+x.amountCents,0),paid=state.expensePayments.filter(paymentIsPaid).reduce((s,x)=>s+x.amountCents,0);
 const pending=state.expensePayments.filter(p=>!paymentIsPaid(p)).reduce((s,x)=>s+x.amountCents,0);
 let html=`<div class="cards">${[['Total charges',money(total/100)],['Montant payé',money(paid/100)],['Reste à payer',money((total-paid)/100)],['Chèques en instance',money(pending/100)]].map(([title,value])=>`<div class="card">${title}<strong>${value}</strong></div>`).join('')}</div><div class="charge-tabs">${[['entry','Saisir une charge'],['history','Historique des charges'],['payments','Paiements des charges'],['recurring','Charges périodiques']].map(([tab,label])=>`<button data-charge-tab="${tab}" class="${chargeTab===tab?'':'secondary'}">${label}</button>`).join('')}</div>`;
 if(chargeTab==='entry')html+=`<div class="panel"><h3>Saisir une charge</h3><form data-kind="expenses">${field('label','Libellé / Dépense')}${field('category','Catégorie (loyer, transport…)')}${field('amount','Montant total','number')}${field('date','Date','date',chargeDate())}<label>Fournisseur<select name="supplierId">${options('suppliers','Facultatif')}</select></label>${field('reference','Référence / Facture')}${field('notes','Notes')}<button>Enregistrer la charge</button></form><p>Le paiement se saisit séparément dans Paiements des charges. Les montants correspondent à la dépense totale, dans la devise de l’entreprise.</p></div>`;
 if(chargeTab==='recurring'){
 const r=editingRecurring||{label:'',category:'',amount:'',active:true,startMonth:chargeDate().slice(0,7)};
 html+=`<div class="panel"><h3>${editingRecurring?'Modifier une charge périodique':'Ajouter une charge périodique'}</h3><form id="recurring-form" data-kind="recurringCharges">${field('label','Libellé','text',r.label)}${field('category','Catégorie','text',r.category)}${field('amount','Montant mensuel','number',r.amount)}${field('startMonth','À partir du mois','month',r.startMonth)}${chargeSupplierSelect(r.supplierId)}<label>État<select name="active"><option value="true" ${r.active?'selected':''}>Active</option><option value="false" ${!r.active?'selected':''}>En pause</option></select></label><button>Enregistrer</button>${editingRecurring?'<button type="button" id="cancel-recurring" class="secondary">Annuler</button>':''}</form><p>Une charge est créée au début de chaque mois (UTC). La modification concerne les prochaines échéances. Une pause conserve les charges existantes ; les mois en pause ne sont pas rattrapés à la reprise.</p>${table(['Charge','Catégorie','Fournisseur','Montant mensuel','Début','État','Actions'],state.recurringCharges.map(x=>[esc(x.label),esc(x.category),esc(x.supplierName),money(x.amount),esc(x.startMonth),x.active?'Active':'En pause',`<button data-edit-recurring="${x.id}" class="secondary">Modifier</button><button data-toggle-recurring="${x.id}" class="${x.active?'danger':''}">${x.active?'Pause':'Activer'}</button>`]))}</div>`;
 }
 if(chargeTab==='history'){
 const rows=state.expenses.filter(x=>(!chargeFilters.search||[x.label,x.category,x.reference,x.supplierName].join(' ').toLowerCase().includes(chargeFilters.search.toLowerCase()))&&(!chargeFilters.from||x.date>=chargeFilters.from)&&(!chargeFilters.to||x.date<=chargeFilters.to)&&(!chargeFilters.status||expenseStatus(x)===chargeFilters.status));
 html+=`<div class="panel"><h3>Historique des charges</h3><form id="charge-filter">${field('search','Rechercher','text',chargeFilters.search)}${field('from','Du','date',chargeFilters.from)}${field('to','Au','date',chargeFilters.to)}<label>Statut<select name="status"><option value="">Tous</option>${['Non payée','Chèque en instance','Partiellement payée','Payée'].map(status=>`<option ${chargeFilters.status===status?'selected':''}>${status}</option>`).join('')}</select></label><button>Filtrer</button><button type="button" id="reset-charge-filters" class="secondary">Réinitialiser</button></form>${table(['Date','Charge / catégorie','Fournisseur','Référence','Total','Payé','Reste','Statut','Actions'],rows.map(x=>[esc(x.date),`${esc(x.label)}<br><small>${esc(x.category)}</small>`,esc(x.supplierName),esc(x.reference),money(x.amount),money(expensePaid(x)/100),money((x.amountCents-expensePaid(x))/100),esc(expenseStatus(x)),expenseCommitted(x)<x.amountCents?`<button data-pay-expense="${x.id}">Payer</button>`:'—']))}<p>${rows.length} charge(s) affichée(s) · Total : ${money(rows.reduce((sum,x)=>sum+x.amountCents,0)/100)}</p></div>`;
 }
 if(chargeTab==='payments')html+=renderChargePayments();
 return html;
}
document.addEventListener('submit',e=>{if(e.target.id==='charge-filter'){e.preventDefault();e.stopImmediatePropagation();chargeFilters=Object.fromEntries(new FormData(e.target));render();}});
document.addEventListener('click',e=>{if(e.target.closest('#reset-charge-filters')){chargeFilters={search:'',from:'',to:'',status:''};render();}});
document.addEventListener('change',e=>{if(page==='charges'&&e.target.name==='expenseId'){selectedExpense=Number(e.target.value);const expense=state.expenses.find(x=>x.id===selectedExpense);if(expense){e.target.form.querySelector('[name="amount"]').value=(expense.amountCents-expenseCommitted(expense))/100;e.target.form.querySelector('[name="supplierId"]').value=expense.supplierId||'';}}});

document.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button)return;try{
 if(button.dataset.editRecurring){editingRecurring={...state.recurringCharges.find(x=>x.id===Number(button.dataset.editRecurring))};render();}
 if(button.id==='cancel-recurring'){editingRecurring=null;render();}
 if(button.dataset.toggleRecurring){const r=state.recurringCharges.find(x=>x.id===Number(button.dataset.toggleRecurring));await api('recurringCharges',{...r,active:!r.active});editingRecurring=null;await load();}
 }catch(error){$('#notice').textContent=error.message;}});

document.addEventListener('change',e=>{if(page==='charges'&&e.target.name==='method'){
 const cheque=e.target.value==='Chèque';const form=e.target.form;
 form.querySelector('#cheque-fields').hidden=!cheque;
 for(const name of ['chequeNumber','chequeDueDate']){const input=form.querySelector(`[name="${name}"]`);input.required=cheque;input.disabled=!cheque;}
 form.querySelector('[name="bankId"]').required=cheque;
}});
function renderChargePayments(){
 const unpaid=state.expenses.filter(x=>expenseCommitted(x)<x.amountCents);
 const current=editingPayment;
 const selected=current?state.expenses.find(x=>x.id===current.expenseId):unpaid.find(x=>x.id===selectedExpense);
 const amount=current?.amount??(selected?(selected.amountCents-expenseCommitted(selected))/100:'');
 const bank=current?.bankId||'';
 const method=current?.method||'Espèces';
 let html=`<div class="panel"><h3>${current?'Modifier le paiement':'Enregistrer un paiement'}</h3>`;
 if(unpaid.length||current)html+=`<form id="payment-form" data-kind="expensePayments"><label>Charge<select name="expenseId" required ${current?'disabled':''}><option value="">Choisir une charge</option>${(current?[selected]:unpaid).map(x=>`<option value="${x.id}" ${x.id===(current?.expenseId||selectedExpense)?'selected':''}>${esc(x.label)} — disponible ${money((x.amountCents-expenseCommitted(x)+(current?.amountCents||0))/100)}</option>`).join('')}</select></label>${field('amount','Montant du paiement','number',amount)}${field('date','Date de saisie / émission','date',current?.date||chargeDate())}<label>Mode de paiement<select name="method">${['Espèces','Virement','App banque','Chèque','Carte','Autre'].map(m=>`<option ${method===m?'selected':''}>${m}</option>`).join('')}</select></label><label>Banque<select name="bankId" ${method==='Chèque'?'required':''}><option value="">Choisir une banque</option>${state.banks.filter(b=>b.active||b.id===bank).map(b=>`<option value="${b.id}" ${b.id===bank?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><div id="cheque-fields" ${method==='Chèque'?'':'hidden'}>${field('chequeNumber','Numéro du chèque','text',current?.chequeNumber)}${field('chequeDueDate','Date d’échéance / à payer le','date',current?.chequeDueDate)}</div>${chargeSupplierSelect(current?.supplierId||selected?.supplierId)}${field('reference','Référence paiement','text',current?.reference)}${field('notes','Notes','text',current?.notes)}<label>Justificatif (PDF, PNG, JPEG · 5 Mo)<input type="file" name="attachmentFile" accept="application/pdf,image/png,image/jpeg"></label><button>${current?'Enregistrer les modifications':'Enregistrer le paiement'}</button>${current?'<button type="button" id="cancel-payment" class="secondary">Annuler</button>':''}</form><p>Les chèques restent en instance jusqu’à validation de leur encaissement. Leurs montants sont réservés pour éviter un double paiement.</p>`;
 else html+='<p>Aucune charge disponible pour un nouveau paiement.</p>';
 html+='</div>';
 if(validationPayment)html+=`<div class="panel"><h3>Valider l’encaissement — ${esc(validationPayment.chequeNumber)}</h3><form id="validate-payment">${field('clearedDate','Date réelle d’encaissement','date',chargeDate())}<button>Confirmer l’encaissement</button><button type="button" id="cancel-payment-action" class="secondary">Annuler</button></form></div>`;
 if(attachmentPayment)html+=`<div class="panel"><h3>Joindre le justificatif signé — ${esc(attachmentPayment.chequeNumber||attachmentPayment.label)}</h3><form id="attach-payment"><label>Document signé (PDF, PNG, JPEG · 5 Mo)<input type="file" name="attachmentFile" accept="application/pdf,image/png,image/jpeg" required></label><button>Enregistrer le document</button><button type="button" id="cancel-payment-action" class="secondary">Annuler</button></form></div>`;
 if(printPayment)html+=`<div class="panel"><h3>Imprimer le chèque — ${esc(printPayment.chequeNumber)}</h3><form id="print-payment">${field('beneficiary','Bénéficiaire','text',printPayment.supplierName||printPayment.label)}${field('words','Montant en lettres')}${field('city','Ville')}<button>Imprimer</button><button type="button" id="cancel-payment-action" class="secondary">Annuler</button></form><p>Modèle générique : vérifiez les positions sur papier avant d’utiliser votre chèque bancaire.</p></div>`;
 html+=`<div class="panel" style="overflow-x:auto"><h3>Historique des paiements</h3>${table(['Date','Charge','Fournisseur','Montant','Mode','Statut','Banque','N° chèque','Échéance','Encaissement','Référence','Pièce jointe','Actions','Modifié par'],state.expensePayments.map(p=>[esc(p.date),esc(p.label),esc(p.supplierName),money(p.amount),esc(p.method),paymentIsPaid(p)?'Validé':'En instance',esc(p.bankName),esc(p.chequeNumber),esc(p.chequeDueDate),esc(p.clearedDate),esc(p.reference),p.attachment?`<a href="/api/attachments/${p.attachment.id}">${esc(p.attachment.name)}</a>`:'—',`${p.method==='Chèque'?`<button data-print-payment="${p.id}">Imprimer</button>`:''}${state.currentUser.role==='admin'?`<button data-edit-payment="${p.id}" class="secondary">Modifier</button><button data-attach-payment="${p.id}" class="secondary">Joindre signé</button>${p.method==='Chèque'&&!paymentIsPaid(p)?`<button data-validate-payment="${p.id}">Valider l’encaissement</button>`:''}`:''}`,esc(p.updatedBy||p.createdBy)]))}</div>`;
 return html;
}
async function paymentAttachment(file){
 if(!file?.size)throw Error('Choisissez un document');if(file.size>5*1024*1024)throw Error('Maximum 5 Mo');
 const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Lecture du document impossible'));reader.readAsDataURL(file);});
 return {name:file.name,mime:file.type,base64};
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const find=id=>state.expensePayments.find(p=>p.id===Number(id));
 if(b.dataset.editPayment){editingPayment={...find(b.dataset.editPayment)};validationPayment=attachmentPayment=printPayment=null;render();}
 if(b.id==='cancel-payment'){editingPayment=null;render();}
 if(b.dataset.attachPayment){attachmentPayment=find(b.dataset.attachPayment);validationPayment=printPayment=null;render();}
 if(b.dataset.validatePayment){validationPayment=find(b.dataset.validatePayment);attachmentPayment=printPayment=null;render();}
 if(b.dataset.printPayment){printPayment=find(b.dataset.printPayment);attachmentPayment=validationPayment=null;render();}
 if(b.id==='cancel-payment-action'){attachmentPayment=validationPayment=printPayment=null;render();}
});
document.addEventListener('submit',async e=>{
 if(!['attach-payment','validate-payment','print-payment'].includes(e.target.id))return;
 e.preventDefault();e.stopImmediatePropagation();const button=e.target.querySelector('button');button.disabled=true;
 try{
 const data=Object.fromEntries(new FormData(e.target));
 if(e.target.id==='print-payment'){
 if(!data.beneficiary.trim()||!data.words.trim())throw Error('Bénéficiaire et montant en lettres obligatoires');
 const p=printPayment;$('#print').innerHTML=`<div class="cheque"><div class="amount">${money(p.amount)}</div><div class="words">${esc(data.words)}</div><div class="beneficiary">${esc(data.beneficiary)}</div><div class="date">${esc(data.city)} ${esc(p.chequeDueDate)}</div></div>`;window.print();
 }else{
 const p=e.target.id==='attach-payment'?attachmentPayment:validationPayment;
 const body={id:p.id,expectedUpdatedAt:p.updatedAt||p.createdAt,action:e.target.id==='attach-payment'?'attachment':'validate'};
 if(body.action==='attachment')body.attachment=await paymentAttachment(data.attachmentFile);else body.clearedDate=data.clearedDate;
 await api('expensePayments',body);attachmentPayment=validationPayment=null;await load();
 }
 }catch(error){$('#notice').textContent=error.message;}finally{button.disabled=false;}
},true);
