(function(root){
 const pending=new Set();
 function beginFormSubmission(form,key){
  if(pending.has(key))return null;
  pending.add(key);
  const controls=Array.from(form.querySelectorAll('button,input[type="submit"]'));
  const previous=controls.map(control=>({control,disabled:control.disabled,text:control.textContent,value:control.value}));
  const submit=controls.find(control=>control.type==='submit');
  const busy=form.getAttribute('aria-busy');
  form.setAttribute('aria-busy','true');
  for(const control of controls)control.disabled=true;
  if(submit){if(submit.tagName==='INPUT')submit.value='Enregistrement en cours…';else submit.textContent='Enregistrement en cours…';}
  let released=false;
  return ()=>{if(released)return;released=true;pending.delete(key);if(busy===null)form.removeAttribute('aria-busy');else form.setAttribute('aria-busy',busy);for(const item of previous){item.control.disabled=item.disabled;item.control.textContent=item.text;item.control.value=item.value;}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={beginFormSubmission};else root.beginFormSubmission=beginFormSubmission;
})(typeof globalThis!=='undefined'?globalThis:this);
