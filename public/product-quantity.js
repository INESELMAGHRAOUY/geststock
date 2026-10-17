function productQuantityMode(product){return product?.quantityMode||((Number.isFinite(product?.stock)&&!Number.isInteger(product.stock))?'decimal':'unit');}
function productQuantityStep(product){return productQuantityMode(product)==='decimal'?0.01:1;}
function validateProductQuantity(product,value){if(!Number.isFinite(value)||productQuantityMode(product)==='unit'&&!Number.isInteger(value))throw Error('Quantité entière obligatoire pour le produit à l’unité : '+(product?.name||''));}
function productQuantityFields(product){return `<label>Gestion de la quantité<select name="quantityMode"><option value="unit" ${productQuantityMode(product)==='unit'?'selected':''}>Unité — quantités entières (1, 2, 3…)</option><option value="decimal" ${productQuantityMode(product)==='decimal'?'selected':''}>Quantité décimale (kg, litre…)</option></select></label>`;}
if(typeof module!=='undefined')module.exports={productQuantityMode,productQuantityStep,validateProductQuantity};
if(typeof document!=='undefined'){
 function updateProductQuantityInputs(){if(typeof state==='undefined')return;const set=(input,p,zero=false)=>{if(!input)return;input.step=String(productQuantityStep(p));input.min=zero?'0':input.step;};const productForm=document.querySelector('#product-form');if(productForm){const p={quantityMode:productForm.elements.quantityMode?.value||'unit'};for(const name of ['stock','min'])set(productForm.elements[name],p,true);}
 for(const input of document.querySelectorAll('[data-purchase-field="qty"]'))set(input,state.products.find(p=>p.id===purchaseDraft[Number(input.dataset.purchaseLine)]?.productId));
 for(const input of document.querySelectorAll('[data-qty]'))set(input,state.products.find(p=>p.id===Number(input.parentElement.querySelector('[data-product]')?.value)));
 const search=document.querySelector('#purchase-search');if(search)set(document.querySelector('#purchase-scan-quantity'),state.products.find(p=>p.id===Number(search.dataset.productId)));
 const inventory=document.querySelector('#inventory-form');if(inventory)set(inventory.elements.counted,state.products.find(p=>p.id===Number(inventory.elements.productId.value)),true);
 for(const input of document.querySelectorAll('#admin-record-form input[name^="lineQty"]')){const i=input.name.slice(7),selector=input.form.elements['lineProduct'+i];set(input,state.products.find(p=>p.id===Number(selector?.value)));}
 }
 document.addEventListener('change',updateProductQuantityInputs);new MutationObserver(updateProductQuantityInputs).observe(document.body,{childList:true,subtree:true});
}
