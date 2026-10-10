const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('replacing catalogue clears stale preview and failed second upload shows error next to button',async()=>{
 const listeners={},nodes={'#jumia-catalog-preview':{innerHTML:'Old preview'},'#jumia-catalog-error':{textContent:''}};
 const context={document:{addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)},$:s=>nodes[s],api:async()=>{throw Error('Feuille Upload Template introuvable');},FileReader:class{readAsDataURL(){this.result='data:application/octet-stream;base64,AA==';this.onload();}}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/jumia.js','utf8'),context);
 const button={textContent:'Prévisualiser',disabled:false},form={id:'jumia-catalog-import-form',elements:{file:{files:[{name:'second.xlsx',size:1}]},storeId:{value:'1'}},querySelector:()=>button};
 const markup=vm.runInContext('catalogImportMarkup(1)',context);assert.ok(markup.indexOf('id="jumia-catalog-error"')<markup.indexOf('id="jumia-catalog-preview"'));
 for(const handler of listeners.change)handler({target:{form,name:'file',dataset:{}}});assert.equal(nodes['#jumia-catalog-preview'].innerHTML,'');
 nodes['#jumia-catalog-preview'].innerHTML='Stale preview';for(const handler of listeners.submit)await handler({target:form,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(nodes['#jumia-catalog-preview'].innerHTML,'');assert.equal(nodes['#jumia-catalog-error'].textContent,'Feuille Upload Template introuvable');assert.equal(button.disabled,false);assert.equal(button.textContent,'Prévisualiser');assert.equal(vm.runInContext('catalogPreview',context),null);
});
