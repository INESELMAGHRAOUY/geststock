let adminRecordEdit=null;
function adminRecordActions(kind,id,edit=true){
 if(state.currentUser?.role!=='admin')return '';
 const record=state[kind].find(x=>x.id===id);if(!record)return '';
 return `<span class="badge">${record.active===false?'Non actif':'Actif'}</span>${edit?`<button type="button" class="secondary" data-admin-edit="${kind}/${id}">Modifier</button>`:''}<button type="button" class="${record.active===false?'secondary':'danger'}" data-admin-state="${kind}/${id}">${record.active===false?'Réactiver':'Désactiver'}</button>`;
}
function adminSelect(name,label,kind,value){return `<label>${label}<select name="${name}"><option value="">Facultatif</option>${state[kind].filter(x=>x.active!==false||x.id===value).map(x=>`<option value="${x.id}" ${x.id===value?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;}
function adminEditorFields(kind,r){
 if(kind==='expenses')return field('label','Libellé','text',r.label)+field('category','Catégorie','text',r.category)+field('amount','Montant','number',r.amount)+field('date','Date','date',r.date)+adminSelect('supplierId','Fournisseur','suppliers',r.supplierId)+field('reference','Référence','text',r.reference)+field('notes','Notes','text',r.notes);
 if(kind==='movements')return adminSelect('supplierId','Fournisseur','suppliers',r.supplierId)+field('reference','Référence du bon','text',r.reference)+`<div id="admin-document-lines" style="width:100%">${adminDocumentLines(adminRecordEdit.data.lines)}</div><button type="button" id="admin-add-line" class="secondary">Ajouter une ligne</button>`;
 if(kind==='inventories')return field('counted','Quantité comptée','number',r.counted);
 if(kind==='cheques')return field('beneficiary','Bénéficiaire','text',r.beneficiary)+field('amount','Montant','number',r.amount)+field('date','Date','date',r.date)+field('reference','Référence','text',r.reference);
 if(kind==='documents')return adminSelect('clientId','Client','clients',r.clientId)+field('tax','TVA (%)','number',r.tax)+`<div id="admin-document-lines" style="width:100%">${adminDocumentLines(r.lines)}</div><button type="button" id="admin-add-line" class="secondary">Ajouter une ligne</button>`;
 return '';
}
function adminDocumentLines(lines){return lines.map((l,i)=>`<div class="line">${adminSelect('lineProduct'+i,'Produit','products',l.productId)}${field('lineQty'+i,'Quantité','number',l.qty)}${field('linePrice'+i,'Prix HT','number',l.price)}${adminRecordEdit?.kind==='movements'?field('lineDiscount'+i,'Remise %','number',l.discount||0):''}<button type="button" data-admin-remove-line="${i}" class="danger">Retirer</button></div>`).join('');}
function captureAdminLines(){const form=document.querySelector('#admin-record-form');return adminRecordEdit.data.lines.map((l,i)=>({...l,productId:Number(form.elements['lineProduct'+i].value),qty:Number(form.elements['lineQty'+i].value),price:Number(form.elements['linePrice'+i].value),...(adminRecordEdit.kind==='movements'?{discount:Number(form.elements['lineDiscount'+i].value)}:{})}));}
function showAdminRecordEditor(kind,id,action){
 const record=state[kind].find(x=>x.id===id);if(!record)return;
 adminRecordEdit={kind,record,action,data:structuredClone(record)};if(kind==='movements')adminRecordEdit.data.lines=(record.lines||[record]).map(l=>({...l,price:l.unitPrice||0}));
 const dialog=document.querySelector('#admin-record-dialog');
 dialog.innerHTML=`<h2>${action==='modify'?'Modifier':record.active===false?'Réactiver':'Désactiver'} — ${esc(record.label||record.name||record.number||record.beneficiary||record.reference||'#'+record.id)}</h2><form id="admin-record-form">${action==='modify'?adminEditorFields(kind,record):''}${field('reason','Motif obligatoire')}<button>Enregistrer</button><button type="button" id="admin-record-cancel" class="secondary">Annuler</button></form><p>Les données et leur historique sont conservés. La correction d’une charge ne modifie pas automatiquement les chèques déjà émis.</p>`;dialog.showModal();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.adminEdit||b.dataset.adminState){const [kind,id]=(b.dataset.adminEdit||b.dataset.adminState).split('/');showAdminRecordEditor(kind,Number(id),b.dataset.adminEdit?'modify':'setActive');}
 if(b.id==='admin-record-cancel')document.querySelector('#admin-record-dialog').close();
 if(b.id==='admin-add-line'){adminRecordEdit.data.lines=captureAdminLines();const p=state.products.find(x=>x.active!==false);adminRecordEdit.data.lines.push({productId:p?.id,qty:1,price:(adminRecordEdit.kind==='movements'?p?.purchasePrice:p?.price)||0});document.querySelector('#admin-document-lines').innerHTML=adminDocumentLines(adminRecordEdit.data.lines);}
 if(b.dataset.adminRemoveLine!==undefined){adminRecordEdit.data.lines=captureAdminLines();adminRecordEdit.data.lines.splice(Number(b.dataset.adminRemoveLine),1);document.querySelector('#admin-document-lines').innerHTML=adminDocumentLines(adminRecordEdit.data.lines);}
});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='admin-record-form')return;e.preventDefault();e.stopImmediatePropagation();const button=e.target.querySelector('button');button.disabled=true;
 try{
 const edit=adminRecordEdit,data=Object.fromEntries(new FormData(e.target));
 for(const key of ['amount','productId','supplierId','qty','tax','clientId','counted','unitPrice'])if(key in data)data[key]=Number(data[key]);
 if(['documents','movements'].includes(edit.kind)&&edit.action==='modify')data.lines=captureAdminLines().map(l=>edit.kind==='movements'?{productId:l.productId,qty:l.qty,unitPrice:l.price,discount:l.discount}:l);
 await api('adminRecords',{kind:edit.kind,id:edit.record.id,action:edit.action,active:edit.record.active===false,expectedRecord:JSON.stringify(edit.record),reason:data.reason,data});document.querySelector('#admin-record-dialog').close();adminRecordEdit=null;await load();
 }catch(error){$('#notice').textContent=error.message;const p=e.target.parentNode.querySelector('.admin-record-error')||document.createElement('p');p.className='admin-record-error';p.textContent=error.message;e.target.parentNode.append(p);}finally{button.disabled=false;}
},true);
function renderRecordAudit(){return `<div class="panel" style="overflow:auto"><h3>Historique des modifications et désactivations</h3>${table(['Date','Section','Élément','Action','Utilisateur','Motif'],state.recordAudit.map(x=>[esc(x.at.replace('T',' ').slice(0,19)+' UTC'),esc(menus[x.kind]||x.kind),esc(x.before.label||x.before.name||x.before.number||x.before.beneficiary||x.before.reference||'#'+x.recordId),esc(x.action),esc(x.actor),esc(x.reason)]))}</div>`;}
