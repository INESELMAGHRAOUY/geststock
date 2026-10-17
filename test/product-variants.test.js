const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeProductVariant}=require('../product-variants');
const {stockBreakdown}=require('../stock');
test('simple products, colors only and color / size produce unambiguous names',()=>{
 assert.deepEqual(normalizeProductVariant({name:'Article'}),{modelName:'Article',color:'',size:'',name:'Article'});
 assert.equal(normalizeProductVariant({name:'Body',color:' Noir ',size:' M '}).name,'Body / Noir / M');
 assert.equal(normalizeProductVariant({name:'Sac',color:'Rouge'}).name,'Sac / Rouge');
});
test('editing from an older client preserves variant attributes without duplicating suffixes',()=>{
 const existing={id:1,...normalizeProductVariant({name:'Body',color:'Noir',size:'M'})};
 assert.deepEqual(normalizeProductVariant({id:1,name:existing.name},[existing]),normalizeProductVariant({name:'Body',color:'Noir',size:'M'}));
 assert.equal(normalizeProductVariant({id:1,name:'Body',color:'',size:''},[existing]).name,'Body');
});
test('duplicate active combinations are refused, other sizes and inactive records are allowed',()=>{
 const p={id:1,active:true,...normalizeProductVariant({name:'Body',color:'Noir',size:'M'})};
 assert.throws(()=>normalizeProductVariant({name:' body ',color:'NOIR',size:'m'},[p]),/existe déjà/);
 assert.doesNotThrow(()=>normalizeProductVariant({name:'Body',color:'Noir',size:'L'},[p]));
 assert.doesNotThrow(()=>normalizeProductVariant({name:'Body',color:'Noir',size:'M'},[{...p,active:false}]));
 for(const color of [123,{},'a'.repeat(81)])assert.throws(()=>normalizeProductVariant({name:'Body',color}),/invalide/);
});
test('purchases and invoices affect only the selected color / size',()=>{
 const a={id:1,initialStock:5},b={id:2,initialStock:7};
 const purchases=[{lines:[{productId:1,qty:3,unitPrice:10}]}],invoices=[{type:'Facture',lines:[{productId:2,qty:2}]}];
 assert.equal(stockBreakdown(a,purchases,invoices).stock,8);
 assert.equal(stockBreakdown(b,purchases,invoices).stock,5);
});
